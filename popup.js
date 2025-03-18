document.addEventListener('DOMContentLoaded', () => {
  const rssInput = document.getElementById('rssInput');
  const addRssButton = document.getElementById('addRss');
  const rssList = document.getElementById('rssList');
  const audioList = document.getElementById('audioList');
  const player = document.getElementById('player');
  const nowPlaying = document.getElementById('nowPlaying');
  const audioLimit = document.getElementById('audioLimit');
  let savePositionInterval;

  // Save position periodically and on pause/stop
  function savePosition() {
    const currentUrl = player.src;
    if (currentUrl && player.currentTime > 0) {
      chrome.storage.local.get('playbackPositions', (data) => {
        const positions = data.playbackPositions || {};
        positions[currentUrl] = player.currentTime;
        chrome.storage.local.set({ playbackPositions: positions });
      });
    }
  }

  // Start periodic saving when playing
  player.addEventListener('play', () => {
    // Save position every 5 seconds during playback
    savePositionInterval = setInterval(savePosition, 5000);
  });

  // Save position and clear interval when paused
  player.addEventListener('pause', () => {
    clearInterval(savePositionInterval);
    savePosition();
  });

  // Save position when switching audio or closing
  window.addEventListener('beforeunload', savePosition);

  // Function to create play button (simplified without resume indicator)
  function createPlayButton(url, title) {
    const playBtn = document.createElement('button');
    playBtn.className = 'audio-control';
    playBtn.textContent = '⏵';  // Unicode play triangle
    playBtn.title = 'Play';

    // Update this button's state when playback state changes
    player.addEventListener('play', () => {
      if (player.src === url) {
        playBtn.textContent = '⏸';  // Unicode pause symbol
        playBtn.title = 'Pause';
      } else {
        playBtn.textContent = '⏵';  // Reset other buttons
        playBtn.title = 'Play';
      }
    });

    player.addEventListener('pause', () => {
      if (player.src === url) {
        playBtn.textContent = '⏵';  // Unicode play triangle
        playBtn.title = 'Play';
      }
    });

    playBtn.addEventListener('click', (e) => {
      e.stopPropagation();

      if (player.src === url) {
        if (player.paused) {
          player.play().catch(err => {
            console.log('Play failed:', err);
          });
        } else {
          player.pause();
        }
      } else {
        playAudio(url, title);
      }
    });

    return playBtn;
  }

  // Modified playAudio function to restore position
  function playAudio(url, title) {
    // Stop current playback before loading new audio
    player.pause();
    
    // Load and play the new audio, restoring position if available
    chrome.storage.local.get(['playbackPositions', 'playedEpisodes'], (data) => {
      const positions = data.playbackPositions || {};
      const playedEpisodes = data.playedEpisodes || {};
      const savedPosition = positions[url] || 0;
      
      // Don't restore position if episode is marked as played
      const isPlayed = Object.values(playedEpisodes).some(urls => urls.includes(url));
      
      player.src = url;
      if (savedPosition > 0 && !isPlayed) {
        player.currentTime = savedPosition;
      } else {
        player.currentTime = 0;
      }
      
      player.play().catch(err => {
        console.log('Play failed:', err);
        if (err.name === 'AbortError') {
          nowPlaying.textContent = '';
        }
      });
      
      nowPlaying.textContent = title;
    });
  }

  // Function to mark episode as played/unplayed (simplified)
  function createMarkPlayedButton(audioUrl, title, feedUrl, isPlayed) {
    const button = document.createElement('button');
    button.textContent = isPlayed ? '↩️' : '✔️';
    button.className = 'audio-control mark-played';
    button.title = isPlayed ? 'Mark as unplayed' : 'Mark as played';

    button.addEventListener('click', () => {
      chrome.storage.local.get('playedEpisodes', (data) => {
        const playedEpisodes = data.playedEpisodes || {};
        
        if (!playedEpisodes[feedUrl]) {
          playedEpisodes[feedUrl] = [];
        }

        if (isPlayed) {
          // Mark as unplayed
          playedEpisodes[feedUrl] = playedEpisodes[feedUrl].filter(url => url !== audioUrl);
        } else {
          // Mark as played
          playedEpisodes[feedUrl].push(audioUrl);
          
          // If this episode is currently playing, stop it
          if (player.src === audioUrl) {
            player.pause();
            player.currentTime = 0;
            nowPlaying.textContent = '';
          }
        }

        // Save played episodes
        chrome.storage.local.set({ playedEpisodes }, () => {
          // Refresh the feed display
          chrome.storage.local.get('feeds', (data) => {
            const feeds = data.feeds || [];
            parseFeeds(feeds);
          });
        });
      });
    });

    return button;
  }

  // Try to parse RSS feed - moved outside initializeApp
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

  // Fetch and parse feeds - moved outside initializeApp
  async function parseFeeds(feeds) {
    audioList.innerHTML = '';
    
    for (const feedUrl of feeds) {
      const result = await tryParseRss(feedUrl);
      if (!result.success) continue;

      const xmlDoc = result.xmlDoc;
      const items = Array.from(xmlDoc.querySelectorAll('item'));
      const audioItems = items.filter(item => 
        item.querySelector('enclosure')?.getAttribute('type') === 'audio/mpeg'
      );

      // Get the feed title
      const feedTitle = xmlDoc.querySelector('channel > title')?.textContent || new URL(feedUrl).hostname;
      
      // Create feed container
      const feedContainer = document.createElement('div');
      feedContainer.className = 'feed-container';
      
      // Add feed title as separator with toggle
      const separator = document.createElement('div');
      separator.className = 'podcast-separator';
      
      const toggleIcon = document.createElement('span');
      toggleIcon.className = 'toggle-icon';
      toggleIcon.textContent = '▼';
      
      const titleText = document.createElement('span');
      titleText.textContent = feedTitle;
      
      separator.appendChild(toggleIcon);
      separator.appendChild(titleText);
      feedContainer.appendChild(separator);

      // Create episodes container
      const episodesContainer = document.createElement('div');
      episodesContainer.className = 'feed-episodes';
      feedContainer.appendChild(episodesContainer);

      // Add click handler for expand/collapse
      separator.addEventListener('click', () => {
        separator.classList.toggle('collapsed');
        episodesContainer.classList.toggle('collapsed');
        toggleIcon.textContent = separator.classList.contains('collapsed') ? '▶' : '▼';
      });

      audioList.appendChild(feedContainer);

      // Get the number of episodes to show
      const limit = parseInt(audioLimit.value) || 3;
      
      // Get played episodes for this feed
      const playedData = await chrome.storage.local.get('playedEpisodes');
      const playedEpisodes = playedData.playedEpisodes || {};
      const playedForFeed = playedEpisodes[feedUrl] || [];

      // Count how many of the first 'limit' items are played
      const playedInLimit = audioItems.slice(0, limit).filter(item => {
        const audioUrl = item.querySelector('enclosure')?.getAttribute('url');
        return audioUrl && playedForFeed.includes(audioUrl);
      }).length;

      // Show additional items equal to the number of played items
      const itemsToShow = audioItems.slice(0, limit + playedInLimit);

      // Show all items
      for (const item of itemsToShow) {
        const title = item.querySelector('title')?.textContent || 'Untitled';
        const audioUrl = item.querySelector('enclosure')?.getAttribute('url');
        const pubDate = item.querySelector('pubDate')?.textContent;
        
        if (!audioUrl) continue;

        const div = document.createElement('div');
        div.className = 'audio-item';

        // Create container for title and date
        const contentDiv = document.createElement('div');
        contentDiv.className = 'audio-content';

        // Add title
        const titleSpan = document.createElement('div');
        titleSpan.className = 'audio-title';
        titleSpan.textContent = title;
        contentDiv.appendChild(titleSpan);

        // Add date if available
        if (pubDate) {
          const dateDiv = document.createElement('div');
          dateDiv.className = 'audio-date';
          const date = new Date(pubDate);
          dateDiv.textContent = 'Publication date: ' + date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          });
          contentDiv.appendChild(dateDiv);
        }

        // Check if episode is marked as played
        const isPlayed = playedForFeed.includes(audioUrl);
        if (isPlayed) {
          div.classList.add('played');
        }

        // Add play button (without resume indicator)
        const playButton = createPlayButton(audioUrl, title);
        div.appendChild(playButton);

        // Add content div with title and date
        div.appendChild(contentDiv);

        // Add mark as played/unplayed button
        const markPlayedButton = createMarkPlayedButton(audioUrl, title, feedUrl, isPlayed);
        div.appendChild(markPlayedButton);

        episodesContainer.appendChild(div);
      }
    }
  }

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
    // Load saved feeds or startup configuration
    chrome.storage.local.get(['feeds'], (data) => {
      const feeds = data.feeds || [];
      if (feeds.length === 0) {
        // Try to load startup configuration
        fetch(chrome.runtime.getURL('startup-config.json'))
          .then(response => response.json())
          .then(config => {
            if (config.feeds && config.feeds.length > 0) {
              const validFeeds = config.feeds.filter(feed => feed.url.trim() !== '');
              if (validFeeds.length > 0) {
                const feedUrls = validFeeds.map(feed => feed.url);
                chrome.storage.local.set({
                  feeds: feedUrls,
                  playedEpisodes: config.playedEpisodes || {},
                  playbackPositions: config.playbackPositions || {}
                }, () => {
                  if (validFeeds[0]?.maxEpisodes) {
                    audioLimit.value = validFeeds[0].maxEpisodes;
                  }
                  feedUrls.forEach(addFeedToUI);
                  parseFeeds(feedUrls);
                });
              }
            }
          })
          .catch(err => console.warn('Failed to load startup configuration:', err));
      } else {
        feeds.forEach(addFeedToUI);
        if (feeds.length > 0) parseFeeds(feeds);
      }
    });

    // Handle configuration export
    document.getElementById('exportConfig').addEventListener('click', async () => {
      try {
        const data = await chrome.storage.local.get(['feeds', 'playbackPositions', 'playedEpisodes', 'audioLimit']);
        
        const config = {
          version: '1.0',
          timestamp: new Date().toISOString(),
          feeds: data.feeds?.map(url => ({
            type: 'rss',  // For future extensibility
            url: url,
            maxEpisodes: parseInt(audioLimit.value) || 3
          })) || [],
          playedEpisodes: data.playedEpisodes || {},
          playbackPositions: data.playbackPositions || {}
        };

        // Create and trigger download
        const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `rss-reader-config-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error('Error exporting configuration:', err);
        alert('Failed to export configuration. Please try again.');
      }
    });

    // Handle configuration import
    document.getElementById('importConfig').addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      
      input.onchange = async (e) => {
        try {
          const file = e.target.files[0];
          if (!file) return;

          const text = await file.text();
          const config = JSON.parse(text);

          // Validate config version and structure
          if (!config.version || !config.feeds) {
            throw new Error('Invalid configuration file format');
          }

          // Extract and save feeds
          const feeds = config.feeds.map(feed => feed.url);
          await chrome.storage.local.set({
            feeds,
            playedEpisodes: config.playedEpisodes || {},
            playbackPositions: config.playbackPositions || {}
          });

          // Update UI
          rssList.innerHTML = '';
          audioList.innerHTML = '';
          feeds.forEach(addFeedToUI);
          if (feeds.length > 0) parseFeeds(feeds);

          // Set episode limit if provided
          if (config.feeds[0]?.maxEpisodes) {
            audioLimit.value = config.feeds[0].maxEpisodes;
          }
        } catch (err) {
          console.error('Error importing configuration:', err);
          alert('Failed to import configuration. Please ensure the file is valid.');
        }
      };

      input.click();
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
