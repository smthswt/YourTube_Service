/* global chrome */

import './App.css';
import Popup from "./components/popup";

function App() {
    const now = new Date();
    console.log("지금 시각 :", now)

    // const GCP_CLOUD_RUN_URL = process.env.REACT_APP_GCP_CLOUD_RUN_URL;
    // console.log("GCP_CLOUD_RUN_URL:", GCP_CLOUD_RUN_URL);

    // const CHUNK_SIZE = 50;  // 🔹 100개씩 나누어 전송

    // const handleCategoryRequestToGCP = async (event) => {
    //     event.preventDefault();
    //     console.log("Sending category model data to GCP in batches");
    //
    //     chrome.runtime.sendMessage({ action: "fetchData" }, async (response) => {
    //         if (response && response.success) {
    //             console.log("response:", response);
    //
    //             const formattedData = response.data.map(video => ({
    //                 ...video,
    //                 thumbnail: Array.isArray(video.thumbnail) ? video.thumbnail[0] : video.thumbnail
    //             }));
    //
    //             console.log("Formatted Videos:", formattedData);
    //
    //             const userId = "Subscribed_Videos";
    //
    //             // 🔹 데이터 100개씩 청크로 나누기
    //             const videoChunks = [];
    //             for (let i = 0; i < formattedData.length; i += CHUNK_SIZE) {
    //                 videoChunks.push(formattedData.slice(i, i + CHUNK_SIZE));
    //             }
    //
    //             console.log(`Sending ${videoChunks.length} chunks to GCP`);
    //
    //             let allResults = [];
    //
    //             for (const [index, chunk] of videoChunks.entries()) {
    //                 console.log(`Sending chunk ${index + 1}/${videoChunks.length}`);
    //
    //                 const requestBody = {
    //                     userId: userId,
    //                     videos: chunk
    //                 };
    //
    //                 try {
    //                     if (index > 0) { // 첫 번째 요청은 대기 없이 바로 보냄
    //                         await new Promise(resolve => setTimeout(resolve, 100000));
    //                     }  // 🔹 100000ms = 1분40초 대기 후 요청
    //
    //                     const gcpResponse = await fetch(GCP_CLOUD_RUN_URL, {
    //                         method: 'POST',
    //                         headers: {
    //                             "Content-Type": "application/json",
    //                         },
    //                         body: JSON.stringify(requestBody),
    //                     });
    //
    //                     if (!gcpResponse.ok) {
    //                         throw new Error(`Failed batch ${index + 1}: ${gcpResponse.statusText}`);
    //                     }
    //
    //                     const responseData = await gcpResponse.json();
    //                     console.log(`Batch ${index + 1} Response:`, responseData);
    //
    //                     allResults = allResults.concat(responseData.videos);
    //
    //                 } catch (error) {
    //                     console.error(`Error in batch ${index + 1}:`, error);
    //                 }
    //             }
    //
    //             // 🔹 모든 배치 처리 완료 후 기존 데이터 삭제 후 새로운 데이터 저장
    //             chrome.storage.local.remove("subscribedVideos", () => {
    //                 console.log("기존 subscribedVideos 데이터를 삭제했습니다.");
    //
    //                 // 🔹 모든 배치 처리 완료 후 chrome storage 저장
    //                 chrome.storage.local.set({subscribedVideos: allResults}, () => {
    //                     console.log('All data saved to chrome.storage.local:', allResults);
    //
    //                     // 🔹 데이터 저장 후 화면 강제 업데이트
    //                     chrome.runtime.sendMessage({ action: "fetchData" }, (response) => {
    //                         if (response.success) {
    //                             console.log("Data fetched after saving:", response.data);
    //                         } else {
    //                             console.error("Failed to fetch data:", response.error);
    //                         }
    //                     });
    //                 });
    //             });
    //
    //         } else {
    //             console.error('Failed to fetch data:', response ? response.error : 'No response');
    //         }
    //     });
    // };


    // const handleCategoryRequestToGCP = async (event) => {
    //     event.preventDefault();
    //     console.log("📡 Sending category model data to GCP in batches");
    //
    //     // 🔹 로딩 상태 활성화 (중복 요청 방지)
    //     chrome.storage.local.set({ GCPisLoading: true });
    //
    //     chrome.runtime.sendMessage({ action: "fetchData" }, async (response) => {
    //         if (response && response.success) {
    //             console.log("✅ Response from storage:", response);
    //
    //             const formattedData = response.data.map(video => ({
    //                 ...video,
    //                 thumbnail: Array.isArray(video.thumbnail) ? video.thumbnail[0] : video.thumbnail
    //             }));
    //
    //             console.log("🎬 Formatted Videos:", formattedData);
    //
    //             const userId = "Subscribed_Videos";
    //
    //             // 🔹 데이터 50개씩 청크로 나누기
    //             const videoChunks = [];
    //             for (let i = 0; i < formattedData.length; i += CHUNK_SIZE) {
    //                 videoChunks.push(formattedData.slice(i, i + CHUNK_SIZE));
    //             }
    //
    //             console.log(`🚀 Sending ${videoChunks.length} chunks to GCP`);
    //
    //             let allResults = [];
    //
    //             for (const [index, chunk] of videoChunks.entries()) {
    //                 console.log(`📦 Sending batch ${index + 1}/${videoChunks.length}`);
    //
    //                 const requestBody = {
    //                     userId: userId,
    //                     videos: chunk
    //                 };
    //
    //                 try {
    //                     if (index > 0) {
    //                         // 🔹 1분 40초 대기 후 요청 (API 제한 방지)
    //                         await new Promise(resolve => setTimeout(resolve, 100000));
    //                     }
    //
    //                     const gcpResponse = await fetch(GCP_CLOUD_RUN_URL, {
    //                         method: 'POST',
    //                         headers: { "Content-Type": "application/json" },
    //                         body: JSON.stringify(requestBody),
    //                     });
    //
    //                     if (!gcpResponse.ok) {
    //                         throw new Error(`🚨 Failed batch ${index + 1}: ${gcpResponse.statusText}`);
    //                     }
    //
    //                     const responseData = await gcpResponse.json();
    //                     console.log(`✅ Batch ${index + 1} Response:`, responseData);
    //
    //                     allResults = allResults.concat(responseData.videos);
    //
    //                 } catch (error) {
    //                     console.error(`❌ Error in batch ${index + 1}:`, error);
    //                 }
    //             }
    //
    //             // 🔹 모든 배치 처리 완료 후 기존 데이터 삭제
    //             chrome.storage.local.remove("subscribedVideos", () => {
    //                 console.log("🗑 기존 subscribedVideos 데이터 삭제 완료");
    //
    //                 // 🔹 새로운 데이터 저장
    //                 chrome.storage.local.set({ subscribedVideos: allResults }, () => {
    //                     console.log('✅ All data saved to chrome.storage.local:', allResults);
    //
    //                     // 🔹 로딩 상태 해제
    //                     chrome.storage.local.remove("GCPisLoading", () => {
    //                         console.log("🟢 로딩 상태 해제 완료");
    //
    //                         // 🔹 데이터 저장 후 UI 업데이트
    //                         chrome.runtime.sendMessage({ action: "fetchData" }, (response) => {
    //                             if (response.success) {
    //                                 console.log("✅ Data fetched after saving:", response.data);
    //                             } else {
    //                                 console.error("❌ Failed to fetch data:", response.error);
    //                             }
    //                         });
    //                     });
    //                 });
    //             });
    //
    //         } else {
    //             console.error('❌ Failed to fetch data:', response ? response.error : 'No response');
    //
    //             // 🔹 에러 발생 시 로딩 상태 해제
    //             chrome.storage.local.remove("GCPisLoading", () => {
    //                 console.log("🟢 로딩 상태 해제 완료");
    //             });
    //         }
    //     });
    // };

    return (
    <div className="App">
        <header className="App-header">
            {/*<Popup handleSubscription={handleRequestToFlaskForAPI} handleCategoryRequest={handleCategoryRequestToGCP}/>*/}
            {/*<Popup handleCategoryRequest={handleCategoryRequestToGCP}/>*/}
            <Popup/>
        </header>
    </div>
  );
}

export default App;
