import { useEffect, useState } from "react";
import "./App.css";

function App() {
    const [score, setScore] = useState<number>(0);

    useEffect(() => {
        if (typeof chrome === "undefined" || !chrome.storage?.local) {
            return;
        }

        chrome.storage.local.get(["currentLoadScore"], (result) => {
            const storedScore = Number(result.currentLoadScore ?? 0);
            setScore(storedScore);
        });

        const handleChange = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
            if (areaName === "local" && changes.currentLoadScore) {
                const newScore = Number(changes.currentLoadScore.newValue ?? 0);
                setScore(newScore);
            }
        };

        chrome.storage.onChanged.addListener(handleChange);

        return () => {
            chrome.storage.onChanged.removeListener(handleChange);
        };
    }, []);

    const status = score < 30 ? "Low" : score < 70 ? "Moderate" : "High";
    const statusClass = score < 30 ? "low" : score < 70 ? "moderate" : "high";

    return (
        <div className="container">
            <header className="container-header">
                <h1>Cognitive Load Meter</h1>
                <p className="subtitle">Live browser focus status</p>
            </header>

            <div className="score-section">
                <div className={`score ${statusClass}`}>{score}</div>
                <div className="status">{status} Load</div>
            </div>
        </div>
    );
}

export default App;
