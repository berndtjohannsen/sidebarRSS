document.addEventListener('DOMContentLoaded', () => {
  const rssInput = document.getElementById('rssInput');
  const addRssButton = document.getElementById('addRss');
  const rssList = document.getElementById('rssList');
  const audioList = document.getElementById('audioList');
  const detachButton = document.getElementById('detachButton');

  let playerWindowId = null;
  let playerTabId = null;

  // Check if we're already in a popup window
  chrome.windows.getCurrent((window) => {
    if (window.type !== 'popup') {
      // If we're in the extension popup, create a persistent window
      const width = 400;
      const height = 600;
      
      chrome.windows.create({
        url: chrome.runtime.getURL('popup.html'),
        type: 'popup',
        width: width,
        height: height,
        left: window.left,
        top: window.top,
        focused: true
      });
      
      // Instead of closing the window, we'll just close the popup
      window.close();
      return; // Stop execution in the original popup
    }
    
    // Continue with normal initialization in the persistent window
    initializeApp();
  });

  function initializeApp() {
    // Load saved feeds and check for existing player window
    chrome.storage.local.get(['feeds', 'playerWindowId', 'playerTabId'], (data) => {
      const feeds = data.feeds || [];
      feeds.forEach(addFeedToUI);
      if (feeds.length > 0) parseFeeds(feeds);
      
      // Check if player window exists
      if (data.playerWindowId) {
        chrome.windows.get(data.playerWindowId, { populate: true }, (window) => {
          if (!chrome.runtime.lastError && window) {
            console.log('Restored existing player window:', window.id);
            playerWindowId = window.id;
            playerTabId = window.tabs[0].id;
          } else {
            console.log('No existing player window found, will create new one when needed');
            chrome.storage.local.remove(['playerWindowId', 'playerTabId']);
          }
        });
      }
    });

    // Rest of your existing code...
    function createPlayerWindow(callback) {
      // First check if window already exists
      if (playerWindowId) {
        chrome.windows.get(playerWindowId, { populate: true }, (window) => {
          if (!chrome.runtime.lastError && window) {
            console.log('Using existing player window');
            chrome.windows.update(playerWindowId, { focused: true }, () => {
              if (callback) callback();
            });
            return;
          }
          // If window doesn't exist, create new one
          createNewPlayerWindow(callback);
        });
      } else {
        createNewPlayerWindow(callback);
      }
    }

    function createNewPlayerWindow(callback) {
      console.log('Creating new player window...');
      const playerUrl = chrome.runtime.getURL('player.html');

      // Get the current window to position the player relative to it
      chrome.windows.getCurrent((currentWindow) => {
        const width = 320;
        const height = 150;
        
        // Position the window relative to the current window
        const left = currentWindow.left + Math.max(0, Math.floor((currentWindow.width - width) / 2));
        const top = currentWindow.top + Math.max(0, Math.floor((currentWindow.height - height) / 2));

        chrome.windows.create({
          url: playerUrl,
          type: 'popup',
          width: width,
          height: height,
          left: left,
          top: top,
          focused: true
        }, (window) => {
          if (chrome.runtime.lastError) {
            console.error('Error creating player window:', chrome.runtime.lastError.message);
            return;
          }
          if (!window || !window.tabs || !window.tabs[0]) {
            console.error('Invalid window created');
            return;
          }

          console.log('Player window created:', window.id);
          playerWindowId = window.id;
          playerTabId = window.tabs[0].id;
          chrome.storage.local.set({ 
            playerWindowId: window.id,
            playerTabId: window.tabs[0].id
          });

          // Wait for the player page to fully load
          const loadListener = function(tabId, info) {
            if (tabId === playerTabId && info.status === 'complete') {
              console.log('Player page loaded');
              chrome.tabs.onUpdated.removeListener(loadListener);
              if (callback) {
                setTimeout(() => {
                  try {
                    callback();
                  } catch (err) {
                    console.error('Callback error:', err);
                  }
                }, 200);
              }
            }
          };
          
          chrome.tabs.onUpdated.addListener(loadListener);
        });
      });
    }

    // Handle detach button
    detachButton.addEventListener('click', () => {
      console.log('Detach button clicked');
      createPlayerWindow();
    });

    // Add new feed URL
    addRssButton.addEventListener('click', () => {
      const feedUrl = rssInput.value.trim();
      if (!feedUrl) return;

      chrome.storage.local.get('feeds', (data) => {
        const feeds = data.feeds || [];
        if (!feeds.includes(feedUrl)) {
          feeds.push(feedUrl);
          chrome.storage.local.set({ feeds });
          addFeedToUI(feedUrl);
          parseFeeds([feedUrl]);
        }
      });

      rssInput.value = '';
    });

    // Display the RSS feed in the UI
    function addFeedToUI(feedUrl) {
      const li = document.createElement('li');
      li.textContent = feedUrl;
      rssList.appendChild(li);
    }

    // Create play button
    function createPlayButton(audioUrl, title) {
      const button = document.createElement('button');
      button.textContent = '▶️';
      button.className = 'audio-control';

      button.addEventListener('click', () => {
        console.log('Play button clicked for:', title);
        if (!playerWindowId || !playerTabId) {
          console.log('No player window exists, creating new one');
          createPlayerWindow(() => {
            console.log('Player window ready, sending play command');
            sendPlayCommand(audioUrl, title, button);
          });
        } else {
          console.log('Checking existing player window');
          chrome.windows.get(playerWindowId, { populate: true }, (window) => {
            if (chrome.runtime.lastError) {
              console.error('Error checking window:', chrome.runtime.lastError.message);
              playerWindowId = null;
              playerTabId = null;
              chrome.storage.local.remove('playerWindowId');
              createPlayerWindow(() => sendPlayCommand(audioUrl, title, button));
            } else if (!window) {
              console.error('Window not found');
              playerWindowId = null;
              playerTabId = null;
              chrome.storage.local.remove('playerWindowId');
              createPlayerWindow(() => sendPlayCommand(audioUrl, title, button));
            } else {
              console.log('Player window exists, sending play command');
              sendPlayCommand(audioUrl, title, button);
            }
          });
        }
      });

      return button;
    }

    function sendPlayCommand(audioUrl, title, button) {
      if (!playerTabId) {
        console.error('No player tab ID available');
        return;
      }

      console.log('Sending play command to tab:', playerTabId);
      chrome.tabs.sendMessage(playerTabId, {
        type: 'playAudio',
        url: audioUrl,
        title: title
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Error sending play command:', chrome.runtime.lastError.message);
          return;
        }
        if (!response) {
          console.error('No response from player tab');
          return;
        }
        console.log('Play command response:', response);
        if (response.success) {
          // Update all buttons
          document.querySelectorAll('.audio-control').forEach(btn => {
            btn.textContent = '▶️';
          });
          button.textContent = '⏸️';
        }
      });
    }

    // Fetch and parse feeds
    function parseFeeds(feeds) {
      audioList.innerHTML = ''; // Clear existing audio files
      feeds.forEach((feedUrl) => {
        console.log('Fetching feed:', feedUrl);
        chrome.runtime.sendMessage({ type: 'fetchFeed', url: feedUrl }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('Error fetching feed:', chrome.runtime.lastError.message);
            return;
          }
          if (!response) {
            console.error('No response from background script');
            return;
          }
          if (response.success) {
            try {
              const xmlText = response.xmlText;
              const parser = new DOMParser();
              const xmlDoc = parser.parseFromString(xmlText, 'application/xml');
              const items = xmlDoc.querySelectorAll('item');
              
              console.log('Found', items.length, 'items in feed');
              items.forEach((item) => {
                const enclosure = item.querySelector('enclosure');
                if (enclosure && enclosure.getAttribute('type') === 'audio/mpeg') {
                  const audioUrl = enclosure.getAttribute('url');
                  const title = item.querySelector('title')?.textContent || 'Unknown Title';
                  
                  const div = document.createElement('div');
                  div.className = 'audio-item';
                  
                  // Add title
                  const titleDiv = document.createElement('div');
                  titleDiv.className = 'audio-title';
                  titleDiv.textContent = title;
                  div.appendChild(titleDiv);
                  
                  // Add play button
                  const playButton = createPlayButton(audioUrl, title);
                  div.appendChild(playButton);
                  
                  audioList.appendChild(div);
                }
              });
            } catch (err) {
              console.error('Error parsing feed:', err);
            }
          } else {
            console.error('Error in feed response:', response.error);
          }
        });
      });
    }
  }
});
