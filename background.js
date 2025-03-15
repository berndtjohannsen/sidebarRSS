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
});
