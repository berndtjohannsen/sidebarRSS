// Audio playback state
let currentTrack = null;
let isPlaying = false;

// Keep track of the active tab that's controlling audio
let activeTabId = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'fetchFeed') {
    const feedUrl = message.url;

    // Ensure the feed URL is valid
    if (!feedUrl) {
      console.error('No valid feed URL provided.');
      sendResponse({ success: false, error: 'No valid feed URL provided.' });
      return;
    }

    // Fetch the RSS feed
    fetch(feedUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.text();
      })
      .then((xmlText) => {
        // Pass the raw XML text back to the popup script
        sendResponse({ success: true, xmlText });
      })
      .catch((error) => {
        console.error('Failed to fetch RSS feed:', error.message);
        sendResponse({ success: false, error: error.message });
      });

    // Important: Return true to indicate asynchronous response handling
    return true;
  }

  // Handle audio playback messages
  if (message.type === 'playAudio') {
    const audioUrl = message.url;
    const title = message.title || 'Unknown Title';
    
    // Store the tab ID that initiated playback
    activeTabId = sender.tab ? sender.tab.id : null;

    // Create a new tab to play the audio
    chrome.tabs.create({
      url: audioUrl,
      active: false
    }, (tab) => {
      // Store the current state
      currentTrack = audioUrl;
      isPlaying = true;

      // Store current playback state
      chrome.storage.local.set({
        currentAudio: {
          url: audioUrl,
          title: title,
          isPlaying: true,
          tabId: tab.id
        }
      });

      sendResponse({ success: true, isPlaying: true });
    });

    return true;
  }

  if (message.type === 'getPlaybackState') {
    sendResponse({
      success: true,
      currentTrack: currentTrack,
      isPlaying: isPlaying
    });
    return true;
  }

  if (message.type === 'stopPlayback') {
    if (activeTabId) {
      chrome.tabs.remove(activeTabId);
      activeTabId = null;
      currentTrack = null;
      isPlaying = false;
      
      chrome.storage.local.set({
        currentAudio: {
          url: null,
          isPlaying: false,
          tabId: null
        }
      });
    }
    sendResponse({ success: true });
    return true;
  }
});
