function TwoGather() {

	/***************************************** ate/monk/ipfs stuff ************************************/
	methods = {};
	
	dougAddr = RootContract;
	flAddr = "";
	afAddr = "";
	myaccountAddr = "";
	var mysubs = [];
	myMonkAddr = "";

	var loadnum = 10; //number of most recent videos to ensure you load
	
	// Used to handle all incoming requests. Calls the Method with the request method name.
	// Later there will probably be a skeleton of some sort, so if you want to write a dapp class, 
	// the sequence would be something like this:
	//
	// var marketApi = new DappCore(...);
	// marketApi.GetJobListings = function(...) { ... };
	// marketApi.CreateJob = function(...) { ... };
	// ...
	//
	this.handle = function(req) {
		var hFunc = methods[req.Method];
		if (typeof(hFunc) != "function"){
			return network.getWsErrorDetailed(E_NO_METHOD,"No handler for method: " + req.Method);
		}
		var jsonResp = hFunc(req.Params);
		jsonResp.Method = req.Method;
		jsonResp.Id = req.Id;
		return jsonResp;
	}
	
	// Do a transaction and return the tx hash.
	function sendMsg(addr, txIndata){
		Println("Sending message");
		for (var i = 0; i < txIndata.length; i++){
			txIndata[i] = txIndata[i].trim();
		}
		Printf("TxData: %v\n", txIndata);
		var rData = monk.Msg(addr, txIndata);
		if (rData.Error !== ""){
			return network.getWsError(rData.Error);
		}
		
		var resp = network.getWsResponse();
		resp.Result = rData.Data.Hash;
		return resp;
	};
	
	// "StorageAt". Simplify storage access. Not gonna pass errors to UI.
	function SA(accAddr, sAddr){
		var sObj = monk.StorageAt(accAddr,sAddr);
		if (sObj.Error !== ""){
			Printf("Error when accessing storage for contract '%s' at address '%s': %s\n",accAddr,sAddr,sObj.Error);
			return "";
		}
		return sObj.Data;
	};
	
	function WriteFile(data){
		var hashObj = ipfs.PushBlockString(data);
		if(hashObj.Error !== "") {
			return "";
		} else {
			// This would be the 32 byte hash (omitting the initial "1220").
			return "0x" + hashObj.Data.slice(2);
		}
	};
	
	// Takes the 32 byte hash. Prepends "1220" to create the full hash.
	function ReadFile(hash){
		var fullHash = "1220" + hash;
		var fileObj = ipfs.GetBlock(fullHash);
		
		if(fileObj.Error !== "") {
			return "";
		} else {
			// This would be the file data as a string.
			return fileObj.Data;
		}
	};

	function GetFile(hash){
		var fullHash = "1220" + hash;
		var fileObj = ipfs.GetFile(fullHash);
		
		if(fileObj.Error !== "") {
			return "";
		} else {
			// This would be the file data as a string.
			return fileObj.Data;
		}
	};
	
	/***************************************** actions/dapp logic ************************************/
	
	methods.Init = function(){

		//Find relevant contracts from Doug
		flAddr = esl.ll.Main(dougAddr,StringToHex("DOUG"), StringToHex("flaggedlist"));
		afAddr = esl.ll.Main(dougAddr,StringToHex("DOUG"), StringToHex("accountfactory"));

		myMonkAddr = monk.ActiveAddress().Data;

		//Find Account contract associated with that name
		myaccAddr = esl.kv.Value(afAddr,StringToHex("accounts"),myMonkAddr);

		//Load subs (This will be used for auto distribution of files)
		mysubs = esl.ll.GetList(myaccAddr,StringToHex("subs"));

		var resp = network.getWsResponse();
		resp.Result = true;
		return resp;
	}

	//Channel obtaining functions
	methods.GetAllAcc = function(){

		var allacc = esl.ll.GetPairs(afAddr,StringToHex("usernames"),0)

		var ret = []
		for (var i = 0; i < allacc.length; i++){
			var accdat = {};
			accdat.username = allacc[i].Value;
			accdat.pubAddr = allacc[i].Key;
			accdat.chanAddr = esl.kv.Value(afAddr,StringToHex("accounts"),allacc[i].Key);
			ret.push(accdat);
		}
		return ret;

	}

	methods.findaccount = function(username){

		var accPubAddr = esl.ll.Main(afAddr,StringToHex("usernames"),username);

		if (accPubAddr==0){
			return nil;
		} else {
			return esl.kv.Value(afAddr,StringToHex("accounts"),accPubAddr);
		}
	}

	//For getting the videos associated with a channel. Passing your account address will get your own videos
	methods.GetChanVids = function(channelAddr, num) {
		//This Returns the "num" most recent videos for the channel at channelAddr
		//If num is zero then returns the full list
		var vids = esl.ll.GetPairsRev(channelAddr,StringToHex("uploads"),num);

		var ret = []
		for (var i = 0; i< vids.length; i++){
			var vdat = {};
			vdat.name = esl.kv.Value(channelAddr,StringToHex("vidnames"),vids[i].Key);
			vdat.file = vids[i].Value;
			vdat.date = esl.kv.Value(channelAddr,StringToHex("uploaddate"),vids[i].Key);
			vdat.vidnum = vids[i].Key;
			vdat.status = esl.kv.Value(channelAddr, StringToHex("status"),vids[i].Key);
			ret.push(vdat);
		}

		return ret; // @andreas I'm not sure at what points i need to do the network response and which ones I don't Some guidance here would be good
	}

	//Get Information about an account
	methods.GetChanInfo = function(channelAddr){
		var ret = {};
		ret.Owner = esl.single.Value(channelAddr,StringToHex("owner"));
		ret.Username = esl.single.Value(channelAddr,StringToHex("username"))
		ret.Created = esl.single.Value(channelAddr,StringToHex("created"))
		ret.BTCAddr = esl.single.Value(channelAddr,StringToHex("BTCAddr"))

		return ret;
	}
	
	//My Account Functions
	methods.setBTC = function(btcaddress){
		var txData = [];
		txData.push("setBTC");
		txData.push(btcaddress);
		return sendMsg(myaccAddr,txData);
	}
	
	// Post a video
	methods.PostVid = function(viddata){

		var txData = [];
		txData.push("upload");
		txData.push(viddata.Title);
		txData.push(viddata.fHash);

		return sendMsg(myaccAddr,txData);
	}

	// Remove your video vidnum
	methods.RemoveVid = function(vidnum){
		var txData = [];
		txData.push("remove");
		txData.push(vidnum);
		return sendMsg(myaccAddr,txData);
	}

	//Subscribe to a channel
	methods.SubTo = function(channelAddr){
		var txData = [];
		txData.push("subscribe");
		txData.push(channelAddr);

		mysubs.push(channelAddr);
		return sendMsg(myaccAddr,txData);
	}

	//unsubscribe from a channel
	methods.UnSubTo = function(channelAddr){
		var txData = [];
		txData.push("unsubscribe");
		txData.push(channelAddr);

		var i = mysubs.indexOf(channelAddr);
		mysubs.splice(i,1);

		return sendMsg(myaccAddr,txData);
	}

	//ADMINISTRATIVE FUNCTIONS
	methods.FlagVid = function(channelAddr,vidnum){
		var txData = [];
		txData.push("flag");
		txData.push(vidnum);
		return sendMsg(channelAddr,txData);
	}

	methods.GetFlaggedVids = function(num) {
		//This Returns the "num" most recent flagged videos
		//If num is zero then returns the full list
		var vids = esl.ll.GetPairsRev(flAddr,StringToHex("flaggedaddr"),num);

		var ret = []
		for (var i = 0; i< vids.length; i++){
			var vdat = {};
			vdat.account = vids[i].Value;
			vdat.vidnum = esl.kv.Value(flAddr,StringToHex("flaggedvidn"),vids[i].Key);
			vdat.casenum = vids[i].Key;
			ret.push(vdat);
		}

		var resp = network.getWsResponse();
		resp.Result = ret;
		return resp;
	}

	methods.ClearFlag = function(casenum){
		var txData = [];
		txData.push("rmflag");
		txData.push(casenum);
		return sendMsg(flAddr,txData);
	}

	// Accept an offer. Both params are strings.
	methods.Blacklist = function(casenum){
		var txData = [];
		txData.push("blacklist");
		txData.push(casenum);
		return sendMsg(flAddr,txData);
	}

	//Account Creation and removal Functions
	//Create a new account
	methods.CreateAccount = function(username){
		var txData = [];
		txData.push("create");
		txData.push(username);
		return sendMsg(afAddr,txData);
	}

	//This Deletes an account both from the usernames database and the actual contract.
	methods.DeleteAccount = function(channelAddr){
		var txData = [];
		txData.push("deleteaccount");
		return sendMsg(channelAddr,txData);
	}

	//Run state updates THIS PRELOADS VIDEOS FROM YOUR SUBSCRIBERS SO YOU DON"T HAVE TO WAIT 
	methods.sync = function(){
		var vidsofsubs = [];

		for(var i = 0; i < mysubs.length; i++){
			var chan = mysubs[i];
			var tvids = GetChanVids(mysubs[i],loadnum);
			for(var j; j < tvids.length; j++){
				//For each video we find we need to check its status
				if(tvids[j].status == 5){
					//Then It is blacklisted Remove this from IPFS
					//note when blacklisted you must match against the first 14 Bytes
				} else {
					GetFile(tvids[j].file);
				}
			}
		}
	}

}

// We overwrite the new websocket session callback with this function. It will
// create a new api and tie it to the session object.
//
// The newWsCallback function must return a function that is called every time
// a new request arrives on the channel, which is set to be the handlers 'handle'
// function.
network.newWsCallback = function(sessionObj){
	var api = new MarketApi(sessionObj);
	api.startListening();
	sessionObj.api = api;
	return function(request){
		return api.handle(request);
	};
}

// This is called when a websocket session is closed. We need to tell it to stop 
// listening for events.
network.deleteWsCallback = function(sessionObj){
	sessionObj.api.stopListening();
}
