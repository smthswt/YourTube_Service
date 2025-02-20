/* global chrome */

import './App.css';
import Popup from "./components/popup";

function App() {
    const now = new Date();
    console.log("지금 시각 :", now)

    return (
    <div className="App">
        <header className="App-header">
            <Popup/>
        </header>
    </div>
  );
}

export default App;
