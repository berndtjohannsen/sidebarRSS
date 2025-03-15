document.addEventListener('DOMContentLoaded', () => {
  const rssInput = document.getElementById('rssInput');
  const addRssButton = document.getElementById('addRss');
  const rssList = document.getElementById('rssList');
  const audioList = document.getElementById('audioList');

  // Load saved feeds from storage
  chrome.storage.local.get('feeds', (data) => {
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

  // Fetch and parse feeds
  function parseFeeds(feeds) {
    audioList.innerHTML = ''; // Clear existing audio files
    feeds.forEach((feedUrl) => {
      chrome.runtime.sendMessage({ type: 'fetchFeed', url: feedUrl }, (response) => {
        if (response && response.success) {
          const xmlText = response.xmlText;
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(xmlText, 'application/xml');
          const items = xmlDoc.querySelectorAll('item');
          
          items.forEach((item) => {
            const enclosure = item.querySelector('enclosure');
            if (enclosure && enclosure.getAttribute('type') === 'audio/mpeg') {
              const audioUrl = enclosure.getAttribute('url');
              const li = document.createElement('li');
              const audio = document.createElement('audio');
              audio.src = audioUrl;
              audio.controls = true;
              li.appendChild(audio);
              audioList.appendChild(li);
            }
          });
        } else {
          console.error('Error fetching feed:', response?.error);
        }
      });
    });
  }
});
