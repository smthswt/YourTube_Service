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
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import concurrent.futures

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

    return result

def get_channel_videos(channel_id, retries=3):
    feed_url = f"https://www.youtube.com/feeds/videos.xml?channel_id={channel_id}"

    for attempt in range(retries):
        try:
            feed = feedparser.parse(feed_url)
            if feed.entries:
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
            else:
                raise Exception("No entries found in RSS feed")
        except Exception as e:
            print(f"Error fetching channel {channel_id}: {e}. Attempt {attempt + 1}/{retries}")
            time.sleep(1)  # 잠시 대기 후 재시도
    return []

# 병렬 처리 코드
def get_video_info(channels, channel_icons):
    result = []

    # ThreadPoolExecutor 생성 시 max_workers를 명시적으로 설정
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        # 각 채널에 대해 get_channel_videos를 병렬로 호출
        future_to_channel = {
            executor.submit(get_channel_videos, channel_id): (channel_id, icon)
            for channel_id, icon in zip(channels, channel_icons)
        }

        for future in concurrent.futures.as_completed(future_to_channel):
            channel_id, channel_icon = future_to_channel[future]
            try:
                videos = future.result()
                # 각 비디오에 channel_icon 추가
                for video in videos:
                    video['channel_icon'] = channel_icon
                    result.append(video)
            except Exception as exc:
                print(f"Error fetching videos for channel {channel_id}: {exc}")

    return result


# Limiter 초기화
limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=["20 per day", "20 per hour"],
    storage_uri="memory://",
)

@app.route("/")
@limiter.limit("3 per minute")
def home():
    return 'YourTube_Flask_Server'

@app.route('/api/videos/subscribed', methods=['GET'])
@limiter.limit("3 per minute")
def subscriptions():
    try:
        subscriptions = get_subscriptions()
        print("구독 정보 접근...")
        channels = list(map(lambda channel: channel['channelId'], subscriptions))
        channel_icons = list(map(lambda channel: channel['thumbnail'], subscriptions))
        # 구독 채널 정보는 영상 정보 가져오기 위해서만 쓰고, 영상 정보만 파일에 저장.
        videos = get_video_info(channels, channel_icons)
        print("구독 영상 정보 불러오기 완료")

        # ****여기서 반환한 videos 데이터를 client쪽에서 받아서 chrome.storage.local로 저장

        # 영상 샘플 5개 출력 - 확인용
        print("영상 정보 : ", videos[:5])

        return jsonify({
            "message": "result from flask",
            "subscriptions": subscriptions,
            "videos": videos
        })
    except Exception as e:
        print(f"Error: {e}")  # 서버 로그에 오류 메시지를 출력
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8000))
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
