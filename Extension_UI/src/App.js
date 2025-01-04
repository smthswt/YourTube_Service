/* global chrome */

import './App.css';
import Popup from "./components/popup";

function App() {
    const now = new Date();
    console.log("지금 시각 :", now)

    const GCP_FUNCTION_URL = process.env.REACT_APP_GCP_FUNCTION_URL;
    // const FLASK_API_URL = process.env.REACT_APP_FLASK_API_URL;


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

                console.log("GCP로 전달한 데이터 :", CategoryData);

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
                    console.log("성공 Response from Cloud Function:", responseData);
                    // alert("Data sent to GCP successfully!");

                    // chrome storage에 data 저장
                    chrome.storage.local.set({ subscribedVideos: responseData.videos }, () => {
                        console.log('Data is saved to chrome.storage.local:', responseData.videos);

                        });

                    // chrome.storage.local.set(
                    // {
                    //     subscribedVideos: data.videos,
                    //     lastUpdatedTime: formattedDate,
                    // },

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
            {/*<Popup handleSubscription={handleRequestToFlaskForAPI} handleCategoryRequest={handleCategoryRequestToGCP}/>*/}
            <Popup handleCategoryRequest={handleCategoryRequestToGCP}/>
        </header>
    </div>
  );
}

export default App;
