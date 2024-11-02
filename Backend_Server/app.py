import pymongo
from flask import Flask, request, jsonify
from flask_cors import CORS
import json
import os
import requests
import google.auth.transport.requests
import google.oauth2.credentials
import google_auth_oauthlib.flow
import googleapiclient.discovery
import googleapiclient.errors
from http.server import BaseHTTPRequestHandler, HTTPServer
import threading
from urllib.parse import parse_qs, urlparse
import webbrowser
import feedparser
from dotenv import load_dotenv
from pymongo import MongoClient

app = Flask(__name__)
# CORS(app)
# CORS 설정 - 모든 경로에서 CORS 요청 허용
CORS(app, resources={r"/*": {"origins": "*"}})


# Define the API credentials and scopes
SCOPES = [
    "https://www.googleapis.com/auth/youtube",
    "https://www.googleapis.com/auth/youtube.force-ssl",
    "https://www.googleapis.com/auth/youtube.readonly",
    "https://www.googleapis.com/auth/youtubepartner"
]

# .env 파일 활성화
# load_dotenv()

# Path to the client_secret.json file
# CLIENT_SECRETS_FILE = os.getenv('API_KEY')
CLIENT_SECRETS_FILE = 'client_secret.json'
PORT = 3031

class OAuthHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        query_components = parse_qs(urlparse(self.path).query)
        if "code" in query_components:
            self.server.code = query_components["code"][0]
            self.send_response(200)
            self.send_header("Content-type", "text/html")
            self.end_headers()
            self.wfile.write(b"<h1>Authentication successful! You can close this window and return to the console.</h1>")
        else:
            self.send_response(400)
            self.send_header("Content-type", "text/html")
            self.end_headers()
            self.wfile.write(b"<h1>Authentication failed!</h1>")

def authenticate():
    flow = google_auth_oauthlib.flow.Flow.from_client_secrets_file(
        CLIENT_SECRETS_FILE, scopes=SCOPES)
    flow.redirect_uri = f"http://localhost:{PORT}/api/oauth2callback"

    authorization_url, _ = flow.authorization_url(
        access_type='offline', include_granted_scopes='true')

    # Start a simple HTTP server to handle the callback
    server = HTTPServer(('localhost', PORT), OAuthHandler)
    threading.Thread(target=server.serve_forever).start()

    webbrowser.open(authorization_url)

    # Wait for the OAuth2 callback to set the code
    while not hasattr(server, 'code'):
        pass

    flow.fetch_token(code=server.code)
    credentials = flow.credentials

    # Shutdown the HTTP server
    server.shutdown()
    return credentials

def get_subscriptions():
    credentials = authenticate()

    youtube = googleapiclient.discovery.build("youtube", "v3", credentials=credentials)

    result = []
    params = {
        'part': 'snippet',
        'mine': True,
        'order': 'unread',
        # 'order': 'date', # 최신 영상부터 가져오는 "date"
        'maxResults': 50 # 각 구독채널에서 가져올 영상 개수
    }

    while True:
        response = youtube.subscriptions().list(**params).execute()

        result.extend([{
            'channelId': item['snippet']['resourceId']['channelId'],
            'channelTitle': item['snippet']['title'],
            'thumbnail': item['snippet']['thumbnails']['default']['url']
        } for item in response['items']])

        if 'nextPageToken' not in response:
            break
        else:
            params['pageToken'] = response['nextPageToken']

    with open('./data/subscriptions.json', 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=2)

    return result


def get_channel_videos(channel_id):
    feed_url = f"https://www.youtube.com/feeds/videos.xml?channel_id={channel_id}"
    feed = feedparser.parse(feed_url)

    videos = []
    for entry in feed.entries:
        video = {
            'video_id': entry.yt_videoid,
            'channel_id': entry.yt_channelid,
            'title': entry.title,
            'link': entry.link,
            'ChannelTitle': entry.author,
            'published': entry.published,
            'description': entry.description,
            'thumbnail': entry.media_thumbnail,
            'views': entry.media_statistics['views'] if 'media_statistics' in entry else 'N/A'
        }
        videos.append(video)
    return videos

# 구독 채널 아이디와 아이콘 정보 저장 예: ["KBS뉴스", "kbs.icon이미지"]
def get_video_info(channels, channel_icons):
    result = []
    for channel in zip(channels, channel_icons):
        channel_id = channel[0]
        # 채널 id를 파라미터로 줘서, get channel videos 함수로 영상 정보 가져옴.
        videos = get_channel_videos(channel_id)
        for video in videos:
            video['channel_icon'] = channel[1]
            result.append(video)
    return result


with open('./data/subscriptions.json') as file:
    data = json.load(file)
    channels = map(lambda channel: channel['channelId'], data)
    channel_icons = map(lambda channel: channel['thumbnail'], data)
    videos = get_video_info(channels, channel_icons)
    with open('videos.json', 'w', encoding='utf-8') as file:
        json.dump(videos, file, ensure_ascii=False, indent=4)



@app.route('/')
def home():  # put application's code here
    return 'YourTubeAPI_Subscription_Flask'

# MongoDB setting
# mongo_uri = f"mongodb+srv://yourtube:ybigta@yourtube.earow10.mongodb.net/?retryWrites=true&w=majority&appName=YourTube"
# client = pymongo.MongoClient(mongo_uri)
# db = client.YourTube
# collection = db["Subscribed_Videos"]


@app.route('/api/videos/subscribed', methods=['GET'])
def subscriptions():
    try:
        subscriptions = get_subscriptions()
        print("get subscription done")
        channels = list(map(lambda channel: channel['channelId'], subscriptions))
        channel_icons = list(map(lambda channel: channel['thumbnail'], subscriptions))
        # 구독 채널 정보는 영상 정보 가져오기 위해서만 쓰고, 영상 정보만 파일에 저장.
        videos = get_video_info(channels, channel_icons)
        print("get video info done")


        # ****여기서 반환한 videos 데이터를 client쪽에서 받아서 chrome.storage.local로 저장

        return jsonify({
            "message": "result from flask",
            "subscriptions": subscriptions,
            "videos": videos
        })
    except Exception as e:
        print(f"Error: {e}")  # 서버 로그에 오류 메시지를 출력
        return jsonify({'error': str(e)}), 500


# GCP - whole category model로 영상 카테고리 분류 요청
# 수정** 그냥 client에서 api gateway 통해서 gcp function으로 다이렉트 요청 ㄱㄱ
# @app.route('/api/classify/bigCateogries', methods=['POST'])
# def classify_whole_categories():
#     print("request recieved")
#     # if request.method == 'OPTIONS':
#     #     # 프리플라이트 요청에 대한 응답을 수동으로 작성
#     #     response = jsonify({'status': 'CORS Preflight'})
#     #     response.headers.add("Access-Control-Allow-Origin", "*")
#     #     response.headers.add("Access-Control-Allow-Headers", "Content-Type,Authorization")
#     #     response.headers.add("Access-Control-Allow-Methods", "POST, OPTIONS")
#     #     return response
#
#     # POST 요청에 대한 처리
#     try:
#         print("request recieved2")
#         # 클라이언트에서 전달받은 동영상 데이터, JSON
#         category_data = request.get_json()
#
#         # GCP 함수 URL
#         gcp_function_url = "https://asia-northeast3-yourtube-427304.cloudfunctions.net/whole-category-final"
#
#         # GCP 함수로 POST 요청 전송
#         gcp_response = requests.post(
#             gcp_function_url,
#             headers={
#                 "Content-Type": "application/json"
#             },
#             data=json.dumps(category_data)  # 클라이언트에서 받은 JSON 데이터를 그대로 GCP로 전달
#         )
#
#         # 응답 데이터 확인 및 클라이언트로 반환
#         if gcp_response.status_code == 200:
#             response_data = gcp_response.json()  # GCP 함수의 응답을 JSON으로 변환
#             print(response_data)
#
#             # mongoDB에 분류된 영상 정보 저장
#             categorized_videos = {
#                 "userId": "Categorized_Videos", # userId 사용자 고유 아이로 변경, 추후
#                 "videos": videos  # 여러 동영상 정보를 videos 필드에 배열로 저장
#             }
#
#             collection.insert_one(categorized_videos)  # 새로운 데이터 삽입/저장
#             print("MongoDB saved")
#
#             return jsonify({"message": "Successfully classified videos", "categorized_data" : response_data}), 200  # GCP의 응답을 클라이언트로 반환
#         else:
#             return jsonify({"error": "Failed to classify videos"}), gcp_response.status_code
#
#     except Exception as e:
#         return jsonify({"error": str(e)}), 500  # 예외 처리 후 클라이언트로 오류 응답


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(debug=True, host='0.0.0.0', port=port)


# 기존 가상 환경 삭제
# rm -rf venv
#가상환경 생성
# python3 -m venv venv
#가상환경 활성화
# source venv/bin/activate
#필요한 패키지 설치 명령어 (선택)
# pip install -r requirements.txt
# 서버 실행 명령어
# python app.py


# pip 문제 있을때
# python3 -m ensurepip --upgrade
# pip install --upgrade pip
