document.addEventListener('DOMContentLoaded', () => {
  const rssInput = document.getElementById('rssInput');
  const addRssButton = document.getElementById('addRss');
  const rssList = document.getElementById('rssList');
  const audioList = document.getElementById('audioList');
  const player = document.getElementById('player');
  const nowPlaying = document.getElementById('nowPlaying');

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
        // Update all buttons
        document.querySelectorAll('.audio-control').forEach(btn => {
          btn.textContent = '▶️';
        });
        
        // If this button is already playing, pause
        if (button.textContent === '⏸️') {
          player.pause();
          button.textContent = '▶️';
          nowPlaying.textContent = '';
          return;
        }
        
        // Play the new audio
        player.src = audioUrl;
        player.play();
        button.textContent = '⏸️';
        nowPlaying.textContent = title;
      });

      return button;
    }

    // Fetch and parse feeds
    function parseFeeds(feeds) {
      console.log('Starting to parse feeds:', feeds);
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
              console.log('Received XML response:', response.xmlText.substring(0, 200) + '...');
              const xmlText = response.xmlText;
              const parser = new DOMParser();
              const xmlDoc = parser.parseFromString(xmlText, 'application/xml');
              const items = xmlDoc.querySelectorAll('item');
              
              console.log('Found', items.length, 'items in feed');
              items.forEach((item) => {
                const enclosure = item.querySelector('enclosure');
                if (enclosure) {
                  console.log('Found enclosure:', enclosure.getAttribute('type'));
                  if (enclosure.getAttribute('type') === 'audio/mpeg') {
                    const audioUrl = enclosure.getAttribute('url');
                    const title = item.querySelector('title')?.textContent || 'Unknown Title';
                    
                    console.log('Creating audio item:', { title, audioUrl });
                    
                    const div = document.createElement('div');
                    div.className = 'audio-item';
                    
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
                    const playButton = createPlayButton(audioUrl, title);
                    div.appendChild(playButton);
                    
                    audioList.appendChild(div);
                  }
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
