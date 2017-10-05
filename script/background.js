class Background {
  constructor() {
    this.filters = {};
    chrome.browserAction.onClicked.addListener(this.onBrowserButtonClicked.bind(this));
    chrome.runtime.onMessage.addListener(this.onMessage.bind(this));
    chrome.tabs.onUpdated.addListener(this.onTabUpdated.bind(this));
    this._domainFilter = null;
    chrome.storage.sync.get(["activeDomainList", "blogDomainList", "imageChecker", "linkFilter", "previewThreshold"], (data)=>{
      this.activeDomainList = (data.activeDomainList&&data.activeDomainList.split(",")) || Background.initialSettings.activeDomainList;
      this.blogDomainList   = (data.blogDomainList  &&data.blogDomainList.split(","))   || Background.initialSettings.blogDomainList;
      this.filters.image    = data.imageChecker || Background.initialSettings.imageChecker;
      this.filters.link     = data.linkFilter || Background.initialSettings.linkFilter;
      this.previewThreshold = data.previewThreshold || Background.initialSettings.previewThreshold;
    });
  }


//----- props
  get domainFilter() {
    if (!this._domainFilter) {
      // set of "[blog domain]/"
      const rexBlogDomainSet = "(" + this.blogDomainList.join("/|").replace(/\./g,"\\.") + "/)";
      this._domainFilter = new RegExp("^(file:|https?:)//" + rexBlogDomainSet + "?.+?/");
    }
    return this._domainFilter;
  }


//----- handler
  onMessage(request, sender, response) {
    this[request.type](sender.tab.id, request.data, response);
  }

  onTabUpdated(tabid, info, tab) {
    if (info.status == "loading") {
      if (this.checkDomain(tab.url)) {
        this.injectScriptTo(tabid);
      } else {
        this.updateBadge(tabid, {text:"OFF", color:[128,128,128,255]});
      }
    }
  }

  onBrowserButtonClicked(tab) {
    if (this.checkDomain(tab.url)) {
      this.unregisterDomain(tab.url);
      this.inactivate(tab.id);
    } else {
      this.registerDomain(tab.url);
      this.activate(tab.id);
    }
  }


//----- domain check
  checkDomain(url) {
    return (this.activeDomainList.indexOf(this._getDomain(url)) != -1);
  }

  registerDomain(url) {
    this.activeDomainList.push(this._getDomain(url));
    chrome.storage.sync.set({
      activeDomainList: this.activeDomainList.join(",")
    });
  }

  unregisterDomain(url) {
    const target = this._getDomain(url);
    this.activeDomainList = this.activeDomainList.filter(domain=>(domain!=target));
    chrome.storage.sync.set({
      activeDomainList: this.activeDomainList.join(",")
    });
  }

  _getDomain(url) {
    const m = url.match(this.domainFilter);
    return m && m[0] || url;
  }


//----- tab operation
  injectScriptTo(tabid) {
    chrome.tabs.insertCSS(tabid, {file:"./style/content.css"}, ()=>{
      chrome.tabs.executeScript(tabid, {file:"./script/content.js"}, ()=>{
        this.activate(tabid);
      });
    });
  }

  activate(tabid) {
    chrome.tabs.sendMessage(tabid, {type:"ping"}, (data)=>{
      if (!data) {
        this.injectScriptTo(tabid);
      } else {
        chrome.tabs.get(tabid, (tab)=>{ 
          const filters = {}, domain = this._getDomain(tab.url);
          for (let key in this.filters) {
            filters[key] = this.filters[key].replace("%DOMAIN%", domain);
          }
          const sendData = {
            filters, 
            threshold: this.previewThreshold, 
            activeDomainList: this.activeDomainList
          };
          chrome.tabs.sendMessage(tabid, {type:"activate", data:sendData}, (data)=>{
            if (data) this.updateBadge(tabid, data);
          });
        });
      }
    });
  }

  inactivate(tabid) {
    chrome.tabs.sendMessage(tabid, {type:"inactivate"}, (data)=>{
      this.updateBadge(tabid, data);
    });   
  }


 
//----- message handler
  updateBadge(tabid, data) {
    chrome.browserAction.setBadgeText({"text":data.text, "tabId":tabid});
    chrome.browserAction.setBadgeBackgroundColor({"color":data.color, "tabId":tabid});
  }

  download(tabid, data) {
    data.images.forEach((image)=>{
      const filename = data.folder+"/"+image.linkurl.match(/.+\/(.+?)([\?#;].*)?$/)[1];
      console.log(filename, image.linkurl);
      chrome.downloads.download({filename, url:image.linkurl, conflictAction:"prompt"}, (id)=>{
      });
    });
  }
}


Background.initialSettings = {
  linkFilter:       ".*", 
  imageChecker:     "^[^?]+\.(jpg|jpeg|gif|png|JPG|JPEG|GIF|PNG)(\\?.*)?$",
  previewThreshold: 360, 
  activeDomainList: [],
  blogDomainList:   ["blog.livedoor.jp"],
  keyboardkey:      true
};


const background = new Background();
