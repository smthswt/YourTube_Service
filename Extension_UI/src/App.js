/* global chrome */

import './App.css';
import Popup from "./components/popup";

function App() {
    // const [openAlert, setOpenAlert] = useState(false)
    const now = new Date();
    console.log("지금 시각 :", now)

    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');

    const formattedDate = `${year}/${month}/${day} ${hours}시 ${minutes}분`;

    const GCP_FUNCTION_URL = process.env.REACT_APP_GCP_FUNCTION_URL;
    const FLASK_API_URL = process.env.REACT_APP_FLASK_API_URL;


    // 나의 구독 영상 요청 API -> public, build 로컬 폴더, mongoDB에 영상 정보 저장
    const handleRequestToFlaskForAPI = async () => {
    console.log("Flask로 유튜브 구독 채널 목록 요청");

    try {
      const response = await fetch(`${FLASK_API_URL}/api/videos/subscribed`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      const data = await response.json();
      console.log("Response from Flask :", data)

      // // 백그라운드 스크립트에 메시지 전송
      // chrome.runtime.sendMessage({ action: "saveData", data: data });

      // chrome storage에 data 저장
      chrome.storage.local.set({ subscribedVideos: data.videos }, () => {
        console.log('Data is saved to chrome.storage.local:', data.videos);

      });

    } catch (error) {
      console.error('Failed to fetch:', error);
    }
  };


    // gcp로 바로 요청하는 코드, api gateway로 보안/인증 기능 추가 필요
    const handleCategoryRequestToGCP = async (event) => {
        event.preventDefault();
        console.log("Sending whole category model data to GCP function");

        // Fetch data request
        chrome.runtime.sendMessage({ action: "fetchData" }, async (response) => {
            if (response && response.success) {
                console.log("response:", response);

                // Ensure the response data is correctly formatted
                const formattedData = response.data.map(video => {
                    if (video.thumbnail && Array.isArray(video.thumbnail)) {
                        video.thumbnail = video.thumbnail[0]; // Assume the first element in the thumbnail array is the correct one
                    }

                    return video;
                });

                console.log("formatted Video:", formattedData);

                const CategoryData = {
                    userId: "Subscribed_Videos", // "Subscribed_Video"
                    videos: formattedData
                };

                console.log("Data to be sent:", CategoryData);

                try {
                    const gcpResponse = await fetch(GCP_FUNCTION_URL, {
                        method: 'POST',
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify(CategoryData),
                    });

                    if (!gcpResponse.ok) {
                        throw new Error('Network response was not ok: ' + gcpResponse.statusText);
                    }

                    const responseData = await gcpResponse.json();
                    console.log("Response from Cloud Function:", responseData);
                    // alert("Data sent to GCP successfully!");



                } catch (error) {
                    console.error("Error sending data to Cloud Function:", error);
                }
            } else {
                console.error('Failed to fetch data:', response ? response.error : 'No response');
            }
        });
    };



    return (
    <div className="App">
        <header className="App-header">
            <Popup handleSubscription={handleRequestToFlaskForAPI} handleCategoryRequest={handleCategoryRequestToGCP}/>
        </header>
    </div>
  );
}

export default App;
