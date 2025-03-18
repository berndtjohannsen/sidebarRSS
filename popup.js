document.addEventListener('DOMContentLoaded', () => {
  const rssInput = document.getElementById('rssInput');
  const addRssButton = document.getElementById('addRss');
  const rssList = document.getElementById('rssList');
  const audioList = document.getElementById('audioList');
  const player = document.getElementById('player');
  const nowPlaying = document.getElementById('nowPlaying');
  const audioLimit = document.getElementById('audioLimit');

  // Check if we're in the original popup
  chrome.windows.getCurrent((currentWindow) => {
    // If this is the original small popup (width < 300), don't do anything
    if (currentWindow.width < 300) {
      return;
    }

    // Check for existing extension window
    chrome.windows.getAll({ populate: true }, (windows) => {
      const existingWindow = windows.find(w => 
        w.type === 'popup' && 
        w.tabs && 
        w.tabs[0] && 
        w.tabs[0].url && 
        w.tabs[0].url.includes(chrome.runtime.getURL('popup.html'))
      );

      if (existingWindow) {
        // Focus the existing window instead of creating a new one
        chrome.windows.update(existingWindow.id, { focused: true });
        return; // Stop execution in the original popup
      }

      // Create new window if none exists
      chrome.windows.create({
        url: chrome.runtime.getURL('popup.html'),
        type: 'popup',
        width: 400,
        height: 600,
        focused: true
      });
      return; // Stop execution in the original popup
    });
    
    // Continue with normal initialization in the persistent window
    initializeApp();
  });

  function initializeApp() {
    // Load saved feeds
    chrome.storage.local.get(['feeds'], (data) => {
      const feeds = data.feeds || [];
      feeds.forEach(addFeedToUI);
      if (feeds.length > 0) parseFeeds(feeds);
    });

    // Add new feed URL
    addRssButton.addEventListener('click', () => {
      const feedUrl = rssInput.value.trim();
      if (!feedUrl) return;

      // Validate URL format
      try {
        new URL(feedUrl);
      } catch (err) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'feed-error';
        errorDiv.textContent = 'Invalid URL format. Please enter a valid URL starting with http:// or https://';
        errorDiv.style.display = 'block';
        
        // Insert error message after input
        const inputGroup = rssInput.parentElement;
        if (inputGroup.querySelector('.feed-error')) {
          inputGroup.querySelector('.feed-error').remove();
        }
        inputGroup.appendChild(errorDiv);
        return;
      }

      chrome.storage.local.get('feeds', (data) => {
        const feeds = data.feeds || [];
        if (!feeds.includes(feedUrl)) {
          feeds.push(feedUrl);
          chrome.storage.local.set({ feeds });
          addFeedToUI(feedUrl);
          parseFeeds(feeds); // Parse all feeds to show complete list
        }
      });

      rssInput.value = '';
      // Clear any previous input error messages
      const inputGroup = rssInput.parentElement;
      const previousError = inputGroup.querySelector('.feed-error');
      if (previousError) {
        previousError.remove();
      }
    });

    // Display the RSS feed in the UI
    function addFeedToUI(feedUrl) {
      const li = document.createElement('li');
      
      const feedInfo = document.createElement('div');
      feedInfo.className = 'feed-info';

      // Initially show URL as title, will be updated when feed is loaded
      const titleDiv = document.createElement('div');
      titleDiv.className = 'feed-title';
      try {
        titleDiv.textContent = new URL(feedUrl).hostname;
      } catch (err) {
        titleDiv.textContent = feedUrl;
      }
      feedInfo.appendChild(titleDiv);

      // Add error message container
      const errorDiv = document.createElement('div');
      errorDiv.className = 'feed-error';
      feedInfo.appendChild(errorDiv);

      const detailsDiv = document.createElement('div');
      detailsDiv.className = 'feed-details';
      
      const urlSpan = document.createElement('span');
      urlSpan.className = 'feed-url';
      urlSpan.textContent = feedUrl;
      
      const episodesSpan = document.createElement('span');
      episodesSpan.className = 'feed-episodes';
      detailsDiv.appendChild(urlSpan);
      detailsDiv.appendChild(episodesSpan);
      
      feedInfo.appendChild(detailsDiv);
      li.appendChild(feedInfo);

      const controls = document.createElement('div');
      controls.className = 'feed-controls';

      const refreshBtn = document.createElement('button');
      refreshBtn.className = 'feed-control-btn refresh';
      refreshBtn.textContent = '↻';
      refreshBtn.title = 'Refresh feed';
      refreshBtn.addEventListener('click', () => {
        chrome.storage.local.get('feeds', (data) => {
          const feeds = data.feeds || [];
          parseFeeds(feeds);
        });
      });

      const removeBtn = document.createElement('button');
      removeBtn.className = 'feed-control-btn remove';
      removeBtn.textContent = '×';
      removeBtn.title = 'Remove feed';
      removeBtn.addEventListener('click', () => {
        chrome.storage.local.get('feeds', (data) => {
          const feeds = data.feeds || [];
          const index = feeds.indexOf(feedUrl);
          if (index > -1) {
            feeds.splice(index, 1);
            chrome.storage.local.set({ feeds }, () => {
              li.remove();
              parseFeeds(feeds);
            });
          }
        });
      });

      controls.appendChild(refreshBtn);
      controls.appendChild(removeBtn);
      li.appendChild(controls);
      rssList.appendChild(li);

      // Fetch feed info immediately to update title and episode count
      chrome.runtime.sendMessage({ type: 'fetchFeed', url: feedUrl }, (response) => {
        if (response?.success) {
          try {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(response.xmlText, 'application/xml');
            
            // Check if parsing resulted in an error
            const parserError = xmlDoc.querySelector('parsererror');
            if (parserError) {
              errorDiv.textContent = 'Invalid RSS feed format';
              errorDiv.style.display = 'block';
              return;
            }
            
            // Update title
            const feedTitle = xmlDoc.querySelector('channel > title')?.textContent;
            if (feedTitle) {
              titleDiv.textContent = feedTitle;
            }
            
            // Update episode count
            const items = xmlDoc.querySelectorAll('item');
            const audioItems = Array.from(items).filter(item => 
              item.querySelector('enclosure')?.getAttribute('type') === 'audio/mpeg'
            );
            episodesSpan.textContent = `Episodes: ${audioItems.length}`;
            
            // Clear any previous errors
            errorDiv.style.display = 'none';
          } catch (err) {
            console.error('Error parsing feed for UI:', err);
            errorDiv.textContent = 'Error parsing feed';
            errorDiv.style.display = 'block';
          }
        } else {
          errorDiv.textContent = response?.error || 'Failed to fetch feed';
          errorDiv.style.display = 'block';
        }
      });
    }

    // Try to parse RSS feed
    async function tryParseRss(feedUrl) {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'fetchFeed', url: feedUrl }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('Error fetching feed:', chrome.runtime.lastError.message);
            resolve({ success: false, error: chrome.runtime.lastError.message });
            return;
          }
          if (!response) {
            console.error('No response from background script');
            resolve({ success: false, error: 'No response from server' });
            return;
          }
          if (response.success) {
            try {
              console.log('Received XML response:', response.xmlText.substring(0, 200) + '...');
              const xmlText = response.xmlText;
              const parser = new DOMParser();
              const xmlDoc = parser.parseFromString(xmlText, 'application/xml');
              
              // Check if parsing resulted in an error
              const parserError = xmlDoc.querySelector('parsererror');
              if (parserError) {
                resolve({ success: false, error: 'Invalid RSS feed format' });
                return;
              }
              
              resolve({ success: true, xmlDoc });
            } catch (err) {
              console.error('Error parsing feed:', err);
              resolve({ success: false, error: err.message });
            }
          } else {
            console.error('Error in feed response:', response.error);
            resolve({ success: false, error: response.error });
          }
        });
      });
    }

    // Create mark as played/unplayed button
    function createMarkPlayedButton(audioUrl, title, feedUrl, isPlayed) {
      const button = document.createElement('button');
      button.textContent = isPlayed ? '↩️' : '✓'; // Curved arrow for unmark, checkmark for mark as played
      button.className = 'audio-control mark-played';
      button.title = isPlayed ? 'Mark as unplayed' : 'Mark as played';

      button.addEventListener('click', async () => {
        // Get current played episodes
        const result = await chrome.storage.local.get('playedEpisodes');
        const playedEpisodes = result.playedEpisodes || {};
        
        if (isPlayed) {
          // Remove this episode from played list
          if (playedEpisodes[feedUrl]) {
            const index = playedEpisodes[feedUrl].indexOf(audioUrl);
            if (index > -1) {
              playedEpisodes[feedUrl].splice(index, 1);
            }
            if (playedEpisodes[feedUrl].length === 0) {
              delete playedEpisodes[feedUrl];
            }
          }
        } else {
          // Add this episode to played list
          if (!playedEpisodes[feedUrl]) {
            playedEpisodes[feedUrl] = [];
          }
          playedEpisodes[feedUrl].push(audioUrl);
        }
        
        // Save updated played episodes
        await chrome.storage.local.set({ playedEpisodes });
        
        // Update UI
        const audioItem = button.closest('.audio-item');
        if (isPlayed) {
          audioItem.classList.remove('played');
        } else {
          audioItem.classList.add('played');
        }
        
        // Update button states
        const playButton = audioItem.querySelector('.audio-control:not(.mark-played)');
        if (playButton) {
          playButton.disabled = !isPlayed; // Enable if marking as unplayed, disable if marking as played
        }
        
        // Refresh all feeds to maintain complete list
        chrome.storage.local.get('feeds', (data) => {
          const feeds = data.feeds || [];
          parseFeeds(feeds);
        });
      });

      return button;
    }

    // Create play button
    function createPlayButton(audioUrl, title, isPlayed) {
      const button = document.createElement('button');
      button.textContent = '▶️';
      button.className = 'audio-control';
      button.disabled = isPlayed;

      if (!isPlayed) {
        button.addEventListener('click', () => {
          // If this is already playing, stop current playback
          if (player.src === audioUrl && !player.paused) {
            player.pause();
            player.currentTime = 0;
            nowPlaying.textContent = '';
            return;
          }
          
          // Stop any currently playing audio
          player.pause();
          player.currentTime = 0;
          
          // Play the new audio
          player.src = audioUrl;
          player.play();
          nowPlaying.textContent = title;
        });
      }

      return button;
    }

    // Check if an episode is marked as played
    async function isEpisodePlayed(audioUrl, feedUrl) {
      const result = await chrome.storage.local.get('playedEpisodes');
      const playedEpisodes = result.playedEpisodes || {};
      return playedEpisodes[feedUrl]?.includes(audioUrl) || false;
    }

    // Fetch and parse feeds
    async function parseFeeds(feeds) {
      console.log('Starting to parse feeds:', feeds);
      audioList.innerHTML = ''; // Clear existing audio files only once at the start
      
      for (const feedUrl of feeds) {
        console.log('Processing feed:', feedUrl);
        
        try {
          const rssResult = await tryParseRss(feedUrl);
          if (rssResult.success) {
            const xmlDoc = rssResult.xmlDoc;
            const items = xmlDoc.querySelectorAll('item');
            
            // Get podcast title
            const podcastTitle = xmlDoc.querySelector('channel > title')?.textContent || 
                               new URL(feedUrl).hostname;
            
            // Add podcast separator
            const separator = document.createElement('div');
            separator.className = 'podcast-separator';
            separator.textContent = podcastTitle;
            audioList.appendChild(separator);
            
            console.log('Found', items.length, 'items in feed');
            let unplayedCount = 0;
            const limit = parseInt(audioLimit.value) || 3;
            
            // First pass: count unplayed episodes and show played ones
            for (const item of items) {
              const enclosure = item.querySelector('enclosure');
              if (enclosure && enclosure.getAttribute('type') === 'audio/mpeg') {
                const audioUrl = enclosure.getAttribute('url');
                const title = item.querySelector('title')?.textContent || 'Unknown Title';
                
                // Check if this episode is marked as played
                const isPlayed = await isEpisodePlayed(audioUrl, feedUrl);
                
                // Create audio item
                const div = document.createElement('div');
                div.className = 'audio-item';
                if (isPlayed) {
                  div.classList.add('played');
                } else {
                  unplayedCount++;
                }
                
                const container = document.createElement('div');
                container.style.flex = '1';
                
                // Add title
                const titleDiv = document.createElement('div');
                titleDiv.className = 'audio-title';
                titleDiv.textContent = title;
                container.appendChild(titleDiv);
                
                // Add publication date
                const pubDate = item.querySelector('pubDate')?.textContent;
                if (pubDate) {
                  const date = new Date(pubDate);
                  const dateDiv = document.createElement('div');
                  dateDiv.className = 'audio-date';
                  dateDiv.textContent = `Published ${date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
                  container.appendChild(dateDiv);
                }
                
                div.appendChild(container);
                
                // Add play button
                const playButton = createPlayButton(audioUrl, title, isPlayed);
                div.appendChild(playButton);
                
                // Add mark played/unplayed button
                const markPlayedButton = createMarkPlayedButton(audioUrl, title, feedUrl, isPlayed);
                div.appendChild(markPlayedButton);
                
                // Only show if:
                // 1. It's played (to maintain history), or
                // 2. It's unplayed and we haven't hit our limit of unplayed episodes
                if (isPlayed || (!isPlayed && unplayedCount <= limit)) {
                  audioList.appendChild(div);
                }
              }
            }
          }
        } catch (err) {
          console.error('Error processing feed:', err);
        }
      }
    }

    // Handle audio limit changes
    audioLimit.addEventListener('change', () => {
      chrome.storage.local.get('feeds', (data) => {
        const feeds = data.feeds || [];
        if (feeds.length > 0) {
          parseFeeds(feeds);
        }
      });
    });
  }
});
