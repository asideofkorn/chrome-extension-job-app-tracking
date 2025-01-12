document.addEventListener("DOMContentLoaded", async () => {
    const list = document.getElementById("url-list");
    const data = await chrome.storage.local.get("urls");
    const urls = data.urls || [];
    urls.forEach((url: string) => {
      const li = document.createElement("li");
      li.textContent = url;
      list?.appendChild(li);
    });
  });