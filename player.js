document.addEventListener('DOMContentLoaded', () => {
    const audioPlayer = document.getElementById('audio-player');
    const titleElement = document.getElementById('title');
    
    if (!audioPlayer || !titleElement) {
        console.error('Required elements not found:', {
            audioPlayer: !!audioPlayer,
            titleElement: !!titleElement
        });
        return;
    }

    // Listen for play commands from the popup
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        console.log('Received message:', message);
        
        if (message.type === 'playAudio') {
            console.log('Playing audio:', message.url);
            titleElement.textContent = message.title;
            audioPlayer.src = message.url;
            audioPlayer.play()
                .then(() => {
                    console.log('Audio started playing');
                    sendResponse({ success: true });
                })
                .catch((error) => {
                    console.error('Error playing audio:', error);
                    sendResponse({ success: false, error: error.message });
                });
            return true; // Keep the message channel open for the async response
        }
        
        if (message.type === 'getState') {
            sendResponse({
                isPlaying: !audioPlayer.paused,
                currentTime: audioPlayer.currentTime,
                duration: audioPlayer.duration,
                url: audioPlayer.src,
                title: titleElement.textContent
            });
            return true;
        }
    });

    // Store playback state periodically
    let stateInterval = setInterval(() => {
        if (audioPlayer.src) { // Only store if there's actually audio loaded
            chrome.storage.local.set({
                currentAudio: {
                    url: audioPlayer.src,
                    title: titleElement.textContent,
                    isPlaying: !audioPlayer.paused,
                    currentTime: audioPlayer.currentTime
                }
            });
        }
    }, 1000);

    // Clean up interval when window closes
    window.addEventListener('unload', () => {
        if (stateInterval) {
            clearInterval(stateInterval);
        }
    });

    // Restore previous state
    chrome.storage.local.get('currentAudio', (data) => {
        if (data.currentAudio && data.currentAudio.url) {
            audioPlayer.src = data.currentAudio.url;
            titleElement.textContent = data.currentAudio.title;
            if (data.currentAudio.currentTime) {
                audioPlayer.currentTime = data.currentAudio.currentTime;
            }
            if (data.currentAudio.isPlaying) {
                audioPlayer.play().catch(console.error);
            }
        }
    });

    // Add error handling for audio element
    audioPlayer.addEventListener('error', (e) => {
        console.error('Audio player error:', e.target.error);
        titleElement.textContent = 'Error playing audio: ' + (e.target.error?.message || 'Unknown error');
    });

    // Add play/pause event listeners to update UI
    audioPlayer.addEventListener('play', () => {
        console.log('Audio started playing');
    });

    audioPlayer.addEventListener('pause', () => {
        console.log('Audio paused');
    });

    audioPlayer.addEventListener('ended', () => {
        console.log('Audio finished');
        titleElement.textContent = 'Playback finished';
    });
}); 