from flask import Flask, redirect, request, jsonify, session
from flask_session import Session
from flask_cors import CORS
import os
import google_auth_oauthlib.flow
import googleapiclient.discovery
from google.oauth2.credentials import Credentials
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import concurrent.futures
import feedparser
import time
import secrets
from google.oauth2.credentials import Credentials
from werkzeug.middleware.proxy_fix import ProxyFix
import json

app = Flask(__name__)
app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)
app.secret_key = secrets.token_hex(32)
CORS(app, resources={r"/*": {"origins": "*"}})
app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)

# Limiter 초기화
limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=["20 per day", "20 per hour"],
    storage_uri="memory://",
)

# 세션 관련 설정
# app.config['SESSION_FILE_DIR'] = '/tmp/flask_session'  # 세션 파일 저장 위치(폴더 만들어서 사용해야함)
app.config['SESSION_TYPE'] = 'filesystem'  # 세션 데이터를 파일 시스템에 저장
app.config['SESSION_PERMANENT'] = False   # 세션이 영구적이지 않게 설정 (브라우저 종료 시 만료)
app.config['SESSION_USE_SIGNER'] = True   # 세션 데이터에 서명을 추가하여 보안을 강화
app.config['PERMANENT_SESSION_LIFETIME'] = 1800  # 세션 만료 시간 설정 (초 단위)
Session(app)

# Google OAuth 설정
SCOPES = [
    "https://www.googleapis.com/auth/youtube",
    "https://www.googleapis.com/auth/youtube.force-ssl",
    "https://www.googleapis.com/auth/youtube.readonly",
    "https://www.googleapis.com/auth/youtubepartner"
]
CLIENT_SECRETS_FILE = 'client_secret.json'

@app.route("/")
@limiter.limit("3 per minute")
def home():
    return 'YourTube_Flask_Server'

@app.route('/api/videos/subscribed', methods=['GET', 'OPTIONS'])
@limiter.limit("3 per minute")
def subscriptions():
    try:
        # 프론트엔드에서 전달된 Access Token 확인
        access_token = session.get('access_token')
        if not access_token:
            return jsonify({"authorization_url": get_auth_url()}), 401

        # Bearer 토큰 형식에서 "Bearer " 제거
        if access_token.startswith("Bearer "):
            access_token = access_token.split(" ")[1]

        # YouTube API 호출
        youtube = get_authenticated_service(access_token)
        if not youtube:
            return jsonify({"error": "YouTube API service creation failed."}), 500
        
        # 구독 채널 정보 가져오기
        subscriptions = get_subscriptions(youtube)
        if subscriptions is None:
            return jsonify({"error": "Failed to fetch subscriptions"}), 500
        print("구독 채널 정보 접근...")
        # print("Subscriptions:", subscriptions)

        channels = list(map(lambda channel: channel['channelId'], subscriptions))
        channel_icons = list(map(lambda channel: channel['thumbnail'], subscriptions))

        # 구독 채널 정보는 영상 정보 가져오기 위해서만 쓰고, 영상 정보만 파일에 저장.
        videos = get_video_info(channels, channel_icons)
        print("구독 영상 정보 불러오기 완료")

        # ****여기서 반환한 videos 데이터를 client쪽에서 받아서 chrome.storage.local로 저장

        return jsonify({
            "message": "Data fetched successfully!",
            "subscriptions": subscriptions,
            "videos": videos
        }), 200, {"Content-Type": "application/json; charset=utf-8"}
    except Exception as e:
        print(f"Error: {e}")  # 서버 로그에 오류 메시지를 출력
        return jsonify({'error': str(e)}), 500

def get_auth_url():
    flow = google_auth_oauthlib.flow.Flow.from_client_secrets_file(
        CLIENT_SECRETS_FILE, scopes=SCOPES
    )
    flow.redirect_uri = "https://yourtube.store/api/oauth2callback"
    authorization_url, _ = flow.authorization_url(
        access_type='offline', include_granted_scopes='true'
    )
    return authorization_url

@app.route('/api/oauth2callback')
def oauth2callback():
    try:
        flow = google_auth_oauthlib.flow.Flow.from_client_secrets_file(
            CLIENT_SECRETS_FILE, scopes=SCOPES)
        flow.redirect_uri = "https://yourtube.store/api/oauth2callback"

        # Authorization Code로 Access Token 발급
        flow.fetch_token(authorization_response=request.url)

        # Credentials 객체에서 필요한 정보 추출
        credentials = flow.credentials
        session['access_token'] = credentials.token
        print(f"세션에 저장된 Access Token: {session.get('access_token')}") 

        # Access Token을 Redirect URL로 전달
        return redirect("/api/videos/subscribed")
    except Exception as e:
        print(f"OAuth2 Error: {e}")
        return jsonify({"error": str(e)}), 500

def get_authenticated_service(access_token):
    with open(CLIENT_SECRETS_FILE, "r") as file:
        client_config = json.load(file)["web"]

    client_id = client_config["client_id"]
    client_secret = client_config["client_secret"]
    token_uri = client_config["token_uri"]

    # Credentials 객체 생성
    credentials = Credentials(
        token=access_token,
        refresh_token=None,  # Refresh Token 필요 시 추가
        token_uri=token_uri,
        client_id=client_id,
        client_secret=client_secret
    )

    # YouTube API 클라이언트 생성
    return googleapiclient.discovery.build("youtube", "v3", credentials=credentials)


def get_subscriptions(youtube):
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

if __name__ == "__main__":
    # Flask 개발 서버 실행
    app.run(debug=True, host="0.0.0.0", port=8000)