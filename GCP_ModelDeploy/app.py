import concurrent.futures
from flask import Flask, request, jsonify, Response
from flask_cors import CORS
import pickle
from google.cloud import storage
import re
import joblib
from youtube_transcript_api import YouTubeTranscriptApi
from langdetect import detect
import nltk
from nltk.corpus import stopwords as nltk_stopwords
from nltk.tokenize import word_tokenize

# Flask 앱 생성
app = Flask(__name__)
# CORS 설정 - 모든 경로에서 CORS 요청 허용
CORS(app, resources={r"/*": {"origins": "*"}})

# ✅ nltk 데이터를 로컬 폴더에서 사용하도록 경로 설정
nltk.data.path.append("/root/nltk_data")

stopwords = {
    'en': set(nltk_stopwords.words('english')),
    'ko': set(['의', '가', '이', '은', '들', '는', '좀', '잘', '걍', '과', '도', '를', '으로', '자', '에', '와', '한', '하다']),
    'fr': set(nltk_stopwords.words('french')),
    'de': set(nltk_stopwords.words('german')),
    'es': set(nltk_stopwords.words('spanish')),
}

# 자막 가져오기 함수
def get_video_captions(video_id, lang):
    try:
        captions = YouTubeTranscriptApi.get_transcript(video_id, languages=[lang])
        caption_text = ' '.join([caption['text'] for caption in captions])
        return caption_text
    except:
        return ""

# 불용어 제거 함수
def remove_stopwords(text, lang):
    try:
        text = text.replace('@', '')  # @ 제거
        filtered_text = re.sub(r'[^\w\s]', '', text)  # 특수문자 제거

        if lang not in stopwords.keys():
            return filtered_text

        words = word_tokenize(filtered_text)
        filtered_words = [word for word in words if word.lower() not in stopwords.get(lang, set())]
        return ' '.join(filtered_words)
    except:
        print(text, lang)
        return ""

# TF-IDF 및 모델 로드
def load_model():
    storage_client = storage.Client()
    bucket = storage_client.get_bucket('whole_category')

    blob_tfidf = bucket.blob("tfidf_vectorizer.pkl")
    blob_model = bucket.blob('whole_category.pkl')

    blob_tfidf.download_to_filename('/tmp/tfidf_vectorizer.pkl')
    blob_model.download_to_filename('/tmp/whole_category.pkl')

    serverless_tfidf = pickle.load(open('/tmp/tfidf_vectorizer.pkl', 'rb'))
    serverless_model = joblib.load(open('/tmp/whole_category.pkl', 'rb'))

    return serverless_tfidf, serverless_model


# 모델 및 벡터라이저 로드
serverless_tfidf, serverless_model = load_model()

# 🔹 청크 크기 설정 (예: 100개씩 처리)
CHUNK_SIZE = 7
MAX_WORKERS = 8

# 🔹 비디오 데이터 처리 함수
def process_video_batch(video_batch):
    batch_result = []

    for video in video_batch:
        video_id = video.get('video_id', '')
        title = video.get('title', '')
        description = video.get('description', '') or "No description"

        lang = video.get(
            'defaultLanguage',
            video.get('defaultAudioLanguage', detect(description if description.strip() else title))
        )
        captions = get_video_captions(video_id, lang)

        # 불용어 제거
        description = remove_stopwords(description, lang)
        captions = remove_stopwords(captions, lang)

        cur_response = video.copy()
        cur_response['description'] = description
        cur_response['captions'] = captions

        # 카테고리 예측
        text = title + ' ' + description + ' ' + captions
        if not text.strip():
            cur_response['wholeCategoryId'] = 0
        else:
            try:
                text_transformed = serverless_tfidf.transform([text])
                whole_category_id = serverless_model.predict(text_transformed)
                cur_response['wholeCategoryId'] = int(whole_category_id[0])
            except Exception as transform_error:
                print(f"Transform error for text: {text}, Error: {transform_error}")
                cur_response['wholeCategoryId'] = 0

        if '_id' in cur_response:
            del cur_response['_id']

        batch_result.append(cur_response)

    return batch_result

@app.route('/whole_category', methods=['POST', 'OPTIONS'])
def whole_category():
    # CORS Preflight 요청 처리
    if request.method == 'OPTIONS':
        return ('', 204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        })

    try:
        request_json = request.get_json()
        userId = request_json.get('userId', '')
        videos = request_json.get('videos', [])

        print('request_json: ', request_json)

        response = {
            'userId': userId,
            'videos': []
        }

        # 🔹 데이터 청크 나누기
        video_chunks = [videos[i:i + CHUNK_SIZE] for i in range(0, len(videos), CHUNK_SIZE)]

        # 🔹 병렬 처리 실행
        with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            futures = [executor.submit(process_video_batch, chunk) for chunk in video_chunks]

            for future in concurrent.futures.as_completed(futures):
                try:
                    response['videos'].extend(future.result())
                except Exception as e:
                    print(f"Thread Error: {e}")

        print('response: ', response)
        print('response length:', len(response['videos']))
        return jsonify(response), 200

    except Exception as e:
        return jsonify({'error': str(e), 'message': 'An error occurred'}), 500


@app.route("/")
def hello_world():
    return f"GCP Cloud Model Sever"

# 🔹 `/favicon.ico` 요청 시 204 응답 반환
@app.route('/favicon.ico')
def favicon():
    return Response(status=204)  # 204 No Content

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080, debug=True)
