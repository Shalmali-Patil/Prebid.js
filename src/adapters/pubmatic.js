var utils = require('../utils.js');
var bidfactory = require('../bidfactory.js');
var bidmanager = require('../bidmanager.js');

/**
 * Adapter for requesting bids from Pubmatic.
 *
 * @returns {{callBids: _callBids}}
 * @constructor
 */
var PubmaticAdapter = function PubmaticAdapter() {
  var bids;
  var usersync = false;
  var _secure = 0;
  let _protocol = ( window.location.protocol ===  "https:" ?  ( _secure = 1, "https"  ) : "http" ) + "://";
  let iframe;

  function _initConf() {
    var conf = {},
      currTime = new Date()
    ;

    conf.SAVersion = "1100";
    conf.wp = "PreBid";
    conf.js = 1;
    conf.grs = 3; //todo Grouped Response parameter, 0: default, 1: variables are split, 2: 1+rid passed to cback func, 3: 1+ md5 of bidid
    conf.a = 1;//todo async == true
    //todo profileid ==> profId
    //todo versionid ==> verId

    conf.wv = CONSTANTS.REPO_AND_VERSION;
    _secure && ( conf.sec = 1 );
    conf.screenResolution =  screen.width + 'x' +screen.height;
    conf.ranreq = Math.random();
    conf.inIframe = window != top ? '1' : '0';

    if(window.navigator.cookieEnabled === false ){
      conf.fpcd = '1';
    }
    
    try {
      conf.pageURL = window.top.location.href;
      conf.refurl = window.top.document.referrer;
    } catch (e) {
      conf.pageURL = window.location.href;
      conf.refurl = window.document.referrer;
    }
    
    conf.kltstamp  = currTime.getFullYear()
      + "-" + (currTime.getMonth() + 1)
      + "-" + currTime.getDate()
      + " " + currTime.getHours()
      + ":" + currTime.getMinutes()
      + ":" + currTime.getSeconds();
    conf.timezone = currTime.getTimezoneOffset()/60  * -1;

    //todo: pm_ctype

    return conf;
  }

  /*
    ToDo
      gender, age, dctr
  */
  function _handleCustomParams(bid, conf){
    if(!conf.kadpageurl){
      conf.kadpageurl = conf.pageURL;
    }

    return conf;
  }

  function _cleanSlots(slots){
    var i,
      len = slots.length,
      tempSlot,
      tempSlots = []
    ;

    for(i=0; i<len; i++){
      tempSlot = slots[i];
      if(utils.isStr(tempSlot)){
        tempSlot = tempSlot.replace(/^\s+/g,'').replace(/\s+$/g,'');
        if(tempSlot.length > 0){
          tempSlots.push( tempSlot );
        }
      }
    }

    return tempSlots;
  }

  function _legacyExecution(conf, slots){
    var url = _generateLegacyCall(conf, slots);
    iframe = utils.createInvisibleIframe();
    var elToAppend = document.getElementsByTagName('head')[0];
    elToAppend.insertBefore(iframe, elToAppend.firstChild);
    var iframeDoc = utils.getIframeDocument(iframe);
    iframeDoc.write(_createRequestContent(url));
    iframeDoc.close();
  }

  function _generateLegacyCall(conf, slots){
    var lessOneHopPubList = {46076:'', 60530:'', 9999:'', 7777:''},
      request_url
    ;
    conf.pm_cb = "window.parent.$$PREBID_GLOBAL$$.handlePubmaticCallback";
    //todo: add pm_dm_enabled in custom params    
    request_url = (conf.pm_dm_enabled != true && !lessOneHopPubList.hasOwnProperty(conf.pubId)) ? ('gads.pubmatic.com/AdServer/AdCallAggregator') : ("haso.pubmatic.com/ads/" + conf.pubId + "/GRPBID/index.html");
    request_url = request_url + '?' + _toUrlParams(conf);
    request_url += '&adslots=' + encodeURIComponent('[' + slots.join(',') +']');
    return _protocol + request_url;
  }

  function _toUrlParams(obj) {
    var values = [],
      key,
      value,
      undefined
    ;

    for(key in obj ){
      value=obj[ key ];      
      if ( obj.hasOwnProperty( key ) && value != undefined && value !== ''  ) {
        values.push(key + '=' + _encodeIfRequired( value ) );
      }
    }

    return values.join( '&' );
  }

  function _encodeIfRequired(s){
    try{    
      s = typeof s === "string" ? s : ''+s; //Make sure that this is string
      s = decodeURIComponent(s) === s ? encodeURIComponent(s) : s;
      if(s.indexOf('&') >=0 || s.indexOf('=') >=0 || s.indexOf('?') >=0 ){
        s = encodeURIComponent(s);
      }
      return s;
    }catch(ex){
      return "";
    }
  }

  function _initUserSync(pubId){
    if (!usersync) {
      var iframe = utils.createInvisibleIframe();
      iframe.src = _protocol + 'ads.pubmatic.com/AdServer/js/showad.js#PIX&kdntuid=1&p=' + pubId;
      try {
        document.body.appendChild(iframe);
      } catch (error) {
        utils.logError(error);
      }
      usersync = true;
    }
  }

  function _callBids(params) {
    var conf = _initConf(),
      slots = []
    ;

    conf.pubId = 0;
    bids = params.bids;

    for (var i = 0; i < bids.length; i++) {
      var bid = bids[i];
      conf.pubId = conf.pubId || bid.params.publisherId;
      conf = _handleCustomParams(bid, conf);
      slots.push(bid.params.adSlot);
    }

    slots = _cleanSlots(_cleanSlots);

    if(conf.pubId && slots.length > 0){
      _legacyExecution(conf, slots);
    }

    _initUserSync(conf.pubId);
  }  

  function _createRequestContent() {
    var content = '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN"' +
      ' "http://www.w3.org/TR/html4/loose.dtd"><html><head><base target="_top" /><scr' +
      'ipt>inDapIF=true;</scr' + 'ipt></head>';
    content += '<body>';    
    content += '<scr' + 'ipt src="'+url+'"></scr' + 'ipt>';    
    content += '</body></html>';
    return content;
  }

  $$PREBID_GLOBAL$$.handlePubmaticCallback = function () {
    let bidDetailsMap = {};
    let progKeyValueMap = {};
    try {
      bidDetailsMap = iframe.contentWindow.bidDetailsMap;
      progKeyValueMap = iframe.contentWindow.progKeyValueMap;
    } catch (e) {
      utils.logError(e, 'Error parsing Pubmatic response');
    }

    var i;
    var adUnit;
    var adUnitInfo;
    var bid;
    var bidResponseMap = bidDetailsMap || {};
    var bidInfoMap = progKeyValueMap || {};
    var dimensions;

    for (i = 0; i < bids.length; i++) {
      var adResponse;
      bid = bids[i].params;

      adUnit = bidResponseMap[bid.adSlot] || {};

      // adUnitInfo example: bidstatus=0;bid=0.0000;bidid=39620189@320x50;wdeal=

      // if using DFP GPT, the params string comes in the format:
      // "bidstatus;1;bid;5.0000;bidid;hb_test@468x60;wdeal;"
      // the code below detects and handles this.
      if (bidInfoMap[bid.adSlot] && bidInfoMap[bid.adSlot].indexOf('=') === -1) {
        bidInfoMap[bid.adSlot] = bidInfoMap[bid.adSlot].replace(/([a-z]+);(.[^;]*)/ig, '$1=$2');
      }

      adUnitInfo = (bidInfoMap[bid.adSlot] || '').split(';').reduce(function (result, pair) {
        var parts = pair.split('=');
        result[parts[0]] = parts[1];
        return result;
      }, {});

      if (adUnitInfo.bidstatus === '1') {
        dimensions = adUnitInfo.bidid.split('@')[1].split('x');
        adResponse = bidfactory.createBid(1);
        adResponse.bidderCode = 'pubmatic';
        adResponse.adSlot = bid.adSlot;
        adResponse.cpm = Number(adUnitInfo.bid);
        adResponse.ad = unescape(adUnit.creative_tag);
        adResponse.ad += utils.createTrackPixelIframeHtml(decodeURIComponent(adUnit.tracking_url));
        adResponse.width = dimensions[0];
        adResponse.height = dimensions[1];
        adResponse.dealId = adUnitInfo.wdeal;

        bidmanager.addBidResponse(bids[i].placementCode, adResponse);
      } else {
        // Indicate an ad was not returned
        adResponse = bidfactory.createBid(2);
        adResponse.bidderCode = 'pubmatic';
        bidmanager.addBidResponse(bids[i].placementCode, adResponse);
      }
    }
  };

  return {
    callBids: _callBids
  };
};

module.exports = PubmaticAdapter;

/*
TODO:
  diff of initConf
    wrapperImpressionID
    merge param
*/