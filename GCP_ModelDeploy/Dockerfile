# 1️⃣ Python 3.9 기반 컨테이너 이미지 사용
FROM python:3.9

# 2️⃣ 작업 디렉토리 설정
WORKDIR /app

# 3️⃣ requirements.txt 복사 및 의존성 설치
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ✅ NLTK 데이터 미리 다운로드
RUN python -c "import nltk; nltk.download('stopwords'); nltk.download('punkt')"

# 4️⃣ Flask 소스 코드 복사
COPY . .

# 5️⃣ Gunicorn을 사용하여 Flask 실행
#CMD ["gunicorn", "-b", "0.0.0.0:8080", "app:app"]

# 5️⃣ Gunicorn 실행: Worker 4개, Timeout 120초로 설정
CMD ["gunicorn", "--workers", "4", "--timeout", "120", "-b", "0.0.0.0:8080", "app:app"]