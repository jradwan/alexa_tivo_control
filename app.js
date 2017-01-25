// load required modules
var alexa = require('alexa-app');
var net = require('net');
require('log-timestamp');

// allow this module to be reloaded by hotswap when changed
module.change_code = 1;

// load configuration parameters
var config = require("./config.json");
var strings = require("./constants.json");
var channels = require("./channels.json");
var chnllist = require("./chnllist.json");

// load settings from config file
var route = config.route || "tivo_control";

// set video and audio provider order
var video_provider_order = [strings.netflix, strings.amazon, strings.hbogo, strings.xfinityondemand, strings.hulu, strings.youtube, strings.mlbtv, strings.plex, strings.vudu, strings.hsn, strings.alt, strings.flixfling, strings.toongoggles, strings.wwe, strings.yahoo, strings.yupptv];
var audio_provider_order = [strings.iheartradio, strings.pandora, strings.plex_m, strings.spotify, strings.vevo];

// define variables
var queuedCommands = [];
var telnetSocket;
var socketOpen = false;
var interval;
var noResponse = true;
var providerEnabled;
var speechList = "";
var cardList = "";
var video_provider_status;
var audio_provider_status;
var tivoIndex = 0;
var totalTiVos = Object.keys(config.tivos).length;
var lastTivoBox = tivoIndex;
var channelName = ""; 
var tivoboxrm = "";
var genres = strings["genres"]

// set default TiVo (first one in config file)
updateCurrentTiVoConfig(tivoIndex);

// define an alexa-app
var app = new alexa.app(route);

// verify appId for incoming request
app.pre = function(request,response,type) {
    if (request.sessionDetails.application.applicationId!=config.alexaAppId &&
        request.sessionDetails.application.applicationId!=strings.alexaTestAppId) {
        response.fail("An invalid applicationId was received.");
    }
};

// general error handling
app.error = function(exception, request, response) {
    console.log(exception);
    response.say("Sorry, an error has occured. Please try your request again.");
};

// launch --------------------------------------------------------------

app.launch(function(request,response) {
    response.say(strings.txt_welcome + strings.txt_launch);
});

if ((process.argv.length === 3) && (process.argv[2] === 'schema'))  {
    console.log (app.schema ());
    console.log (app.utterances ());
}


// command-grouping arrays ---------------------------------------------

var IRCODE_COMMANDS = ["UP", "DOWN", "LEFT", "RIGHT", "SELECT", "TIVO", "LIVETV", "GUIDE", "INFO", "EXIT", "THUMBSUP", "THUMBSDOWN", "CHANNELUP", "CHANNELDOWN", "MUTE", "VOLUMEUP", "VOLUMEDOWN", "TVINPUT", "VIDEO_MODE_FIXED_480i", "VIDEO_MODE_FIXED_480p", "VIDEO_MODE_FIXED_720p", "VIDEO_MODE_FIXED_1080i", "VIDEO_MODE_HYBRID", "VIDEO_MODE_HYBRID_720p", "VIDEO_MODE_HYBRID_1080i", "VIDEO_MODE_NATIVE", "CC_ON", "CC_OFF", "OPTIONS", "ASPECT_CORRECTION_FULL", "ASPECT_CORRECTION_PANEL", "ASPECT_CORRECTION_ZOOM", "ASPECT_CORRECTION_WIDE_ZOOM", "PLAY", "FORWARD", "REVERSE", "PAUSE", "SLOW", "REPLAY", "ADVANCE", "RECORD", "NUM0", "NUM1", "NUM2", "NUM3", "NUM4", "NUM5", "NUM6", "NUM7", "NUM8", "NUM9", "ENTER", "CLEAR", "ACTION_A", "ACTION_B", "ACTION_C", "ACTION_D", "BACK", "WINDOW"];

var KEYBOARD_COMMANDS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "MINUS", "EQUALS", "LBRACKET", "RBRACKET", "BACKSLASH", "SEMICOLON", "QUOTE", "COMMA", "PERIOD", "SLASH", "BACKQUOTE", "SPACE", "KBDUP", "KBDDOWN", "KBDLEFT", "KBDRIGHT", "PAGEUP", "PAGEDOWN", "HOME", "END", "CAPS", "LSHIFT", "RSHIFT", "INSERT", "BACKSPACE", "DELETE", "KBDENTER", "STOP", "VIDEO_ON_DEMAND"];

var TELEPORT_COMMANDS = ["TIVO", "GUIDE", "NOWPLAYING"];


// intents -------------------------------------------------------------

// HELP

app.intent('Help',
    {
        "slots":{},
        "utterances":[ "{for|} {help|assistance}" ]
    },
    function(request,response) {
        console.log("Help requested, adding card.");
        response.say(strings.txt_launch + strings.txt_card);
        response.card("Help", strings.txt_help);
    });

app.intent('ListEnabledProviders',
    {
        "slots":{},
        "utterances":[ "{for|to} {my providers|list my providers|provider|list providers|provider list|list enabled providers}" ]
    },
    function(request,response) {
        console.log("List of enabled providers requested, adding card.");
        createProviderList();
        response.say(strings.txt_enabledlist + currentTiVoBox + strings.txt_enabledlist2 + speechList + strings.txt_enabledcard);
        response.card("Providers", strings.txt_providercard + currentTiVoBox + strings.txt_providercard2 + cardList + strings.txt_providerfooter);
    });

app.intent('ListChannels',
    {
        "slots":{"GENRE":"AMAZON.Genre"},
        "utterances":[ "{for|to} {my channels|my channel list|list my channels|list channels|channel list|list channel names} {for +GENRE+|by +GENRE+|}" ]
    },
    function(request,response) {
		var genre = String(request.slot("GENRE"));
		genre = genre.toLowerCase();
        console.log("List of named channels requested, adding card.");
		if ( genre == 'undefined' ) {
			genre = "all";
			createChannelList(genre);
		} else if ( genres.indexOf(genre) < 0 ) {
			console.log("Genre selected: " + genre);
			response.say("Selected genre not found. Genres available are ." + genres + strings.txt_enabledcard);
			genres = genres.toUpperCase();
			genres = genres.replace(/\,\ /g, "\n-");
			console.log("List of genres:\n-" + genres);
			response.card("Channel Genres", "\n-" + genres);
			return
		} else {
			createChannelList(genre);
		}
        response.say(strings.txt_channelscard + genre + "." + speechList + strings.txt_enabledcard);
		response.card("Channels  (" + genre + ")", strings.txt_channelscard + genre + "." + cardList + strings.txt_channelsfooter);
    });
	
	app.intent('ListGenres',
    {
        "slots":{},
        "utterances":[ "{for|to} {my genres|my channel genres|list my genres|list genres|genres list}" ]
    },
    function(request,response) {
		genres = genres.toUpperCase();
        console.log("List of channel genres requested, adding card.");
        response.say("Your channel genres are ." + genres + strings.txt_enabledcard);
		genres = genres.replace(/\,\ /g, "\n-");
		console.log("List of genres:\n-" + genres);
		response.card("Channel Genres", "\n-" + genres);
    });
	
// BOX SELECTION

app.intent('ChangeTiVoBox',
    {
       "slots":{"TIVOBOX":"AMAZON.Room"},
        "utterances":[ "{to|} {control|select|switch to|use} {-|TIVOBOX}" ]
    },
    function(request,response) {

        if (totalTiVos > 1) {
            currentTiVoBox = request.slot("TIVOBOX");
            console.log("Control requested for '" + currentTiVoBox + "' TiVo.");

            // confirm selected TiVo exists in config.json
            tivoIndex = findTiVoBoxConfig(currentTiVoBox);

            if (tivoIndex < 0) {
                // the requested TiVo doesn't exist in the config file
                console.log("Undefined TiVo requested. Switching back to default.");
                response.say(strings.txt_undefinedtivo + currentTiVoBox + strings.txt_undefinedtivo2);
                tivoIndex = 0;
            }
        }
        else {
            // only one TiVo is configured so ignore the any switch requests
            response.say(strings.txt_onetivo);
        }

        updateCurrentTiVoConfig(tivoIndex);
        response.say("Currently controlling your " + currentTiVoBox + " TiVo.");
    });

app.intent('WhichTiVoBox',
    {
       "slots":{},
        "utterances":[ "{which|current} {tivo|tivo box|dvr|box}" ]
    },
    function(request,response) {
        console.log("Currently controlling: " + currentTiVoBox + " (" + currentTiVoIP + ")");
        response.say("Currently controlling your " + currentTiVoBox + " TiVo.");
    });

app.intent('ListTiVoBoxes',
    {
        "slots":{},
        "utterances":[ "{for|to} {my tivos|list my tivos|tivo|list tivos|tivo list|list tivo boxes|list boxes}" ]
    },
    function(request,response) {
        console.log("List of Tivo boxes requested, adding card.");
        createTiVoBoxList();
        response.say(strings.txt_tivolist + speechList + strings.txt_enabledcard);
        response.card("TiVo Boxes", strings.txt_tivolist + cardList + strings.txt_tivofooter);
    });

// PLACES

app.intent('GoHome',
    {
        "slots":{},
        "utterances":[ "{show|go} {to|to the|} {home|tivo central} {screen|}", "tivo central", "home" ]
    },
    function(request,response) {
        var commands = [];
        commands.push("TIVO");
        sendCommands(commands);
    });


app.intent('LiveTV',
    {
        "slots":{},
        "utterances":[ "{show|go to|} live tv" ]
    },
    function(request,response) {
        var commands = [];
        commands.push("LIVETV");
        sendCommands(commands);
    });

app.intent('Guide',
    {
        "slots":{},
        "utterances":[ "{show|show the|go to|go to the|} {guide}" ]
    },
    function(request,response) {
        var commands = [];
        commands.push("GUIDE");
        sendCommands(commands);
    });

app.intent('OnePassManager',
    {
        "slots":{},
        "utterances":[ "{go to|open|open up|display|launch|show} {my|} {onepasses|season passes}", "{onepass manager|season passes}" ]
    },
    function(request,response) {
        var commands = [];
        commands.push("TIVO");
        commands.push("NUM1");
        sendCommands(commands);
    });

app.intent('ToDoList',
    {
        "slots":{},
        "utterances":[ "{go to|open|open up|display|launch|show} {my|} {to do list}", "to do list" ]
    },
    function(request,response) {
        var commands = [];
        commands.push("TIVO");
        commands.push("NUM2");
        sendCommands(commands);
    });

app.intent('WishLists',
    {
        "slots":{},
        "utterances":[ "{go to|open|open up|display|launch|show} {my|} {wishlists}", "wish lists" ]
    },
    function(request,response) {
        var commands = [];
        commands.push("TIVO");
        commands.push("NUM3");
        sendCommands(commands);
    });

app.intent('Search',
    {
        "slots":{"TIVOSEARCHREQMOVIE":"AMAZON.Movie","TIVOSEARCHREQTVSERIES":"AMAZON.TVSeries"},
        "utterances":[ "{go to|to|open|open up|display|launch|show|} {search|find} {for +TIVOSEARCHREQMOVIE+|+TIVOSEARCHREQMOVIE+|for +TIVOSEARCHREQTVSERIES+|+TIVOSEARCHREQTVSERIES+|}" ]
    },
    function(request,response) {
        var commands = [];
		var TIVOSEARCHREQMOVIE = String(request.slot("TIVOSEARCHREQMOVIE"));
		var TIVOSEARCHREQTVSERIES = String(request.slot("TIVOSEARCHREQTVSERIES"));
		var j = 0;
		TIVOSEARCHREQMOVIE = TIVOSEARCHREQMOVIE.toUpperCase();
		TIVOSEARCHREQTVSERIES = TIVOSEARCHREQTVSERIES.toUpperCase();
		console.log(TIVOSEARCHREQMOVIE);
		console.log(TIVOSEARCHREQTVSERIES);
        commands.push("TIVO");
        commands.push("NUM4");
		if( TIVOSEARCHREQMOVIE != 'UNDEFINED') {
			console.log("Movie Search");
			for ( i = 0; i < TIVOSEARCHREQMOVIE.length; i++) {
				j = i + 1;
				if ( TIVOSEARCHREQMOVIE.substring(i, j) == " ") {
					commands.push("SPACE");
				} else {
					commands.push(TIVOSEARCHREQMOVIE.substring(i, j));
				}
			}
		}
		if( TIVOSEARCHREQTVSERIES != 'UNDEFINED') {
			console.log("Television Search");
			for ( i = 0; i < TIVOSEARCHREQTVSERIES.length; i++) {
				j = i + 1;
				if ( TIVOSEARCHREQTVSERIES.substring(i, j) == " ") {
					commands.push("SPACE");
				} else {
					commands.push(TIVOSEARCHREQTVSERIES.substring(i, j));
				}
			}
		}
        sendCommands(commands);
    });

app.intent('Type',
    {
        "slots":{"TIVOTYPEREQMOVIE":"AMAZON.Movie","TIVOTYPEREQTVSERIES":"AMAZON.TVSeries"},
        "utterances":[ "{to|} type {+TIVOTYPEREQMOVIE+|+TIVOTYPEREQTVSERIES+}" ]
    },
    function(request,response) {
        var commands = [];
		var TIVOTYPEREQMOVIE = String(request.slot("TIVOTYPEREQMOVIE"));
		var TIVOTYPEREQTVSERIES = String(request.slot("TIVOTYPEREQTVSERIES"));
		var j = 0;
		TIVOTYPEREQMOVIE = TIVOTYPEREQMOVIE.toUpperCase();
		TIVOTYPEREQTVSERIES = TIVOTYPEREQTVSERIES.toUpperCase();
		console.log(TIVOTYPEREQMOVIE);
		console.log(TIVOTYPEREQTVSERIES);
		if( TIVOTYPEREQMOVIE != 'UNDEFINED') {
			console.log("Type Movie");
			for ( i = 0; i < TIVOTYPEREQMOVIE.length; i++) {
				j = i + 1;
				if ( TIVOTYPEREQMOVIE.substring(i, j) == " ") {
					commands.push("SPACE");
				} else {
					commands.push(TIVOTYPEREQMOVIE.substring(i, j));
				}
			}
		}
		if( TIVOTYPEREQTVSERIES != 'UNDEFINED') {
			console.log("Type Television");
			for ( i = 0; i < TIVOTYPEREQTVSERIES.length; i++) {
				j = i + 1;
				if ( TIVOTYPEREQTVSERIES.substring(i, j) == " ") {
					commands.push("SPACE");
				} else {
					commands.push(TIVOTYPEREQTVSERIES.substring(i, j));
				}
			}
		}
        sendCommands(commands);
    });

app.intent('MyShows',
    {
        "slots":{},
        "utterances":[ "{go to|open|open up|display|launch|show} {now playing|my shows|my recordings}", "my shows" ]
    },
    function(request,response) {
        var commands = [];
        commands.push("NOWPLAYING");
        sendCommands(commands);
    });

app.intent('Browse',
    {
        "slots":{},
        "utterances":[ "{go to|open|open up|display|launch|show|} browse", "browse" ]
    },
    function(request,response) {
        var commands = [];
        commands.push("TIVO");
        commands.push("NUM5");
        sendCommands(commands);
    });

app.intent('History',
    {
        "slots":{},
        "utterances":[ "{go to|open|open up|display|launch|show|} {my|} {recording|} history", "history" ]
    },
    function(request,response) {
        var commands = [];
        commands.push("TIVO");
        commands.push("NUM6");
        sendCommands(commands);
    });

app.intent('WhatToWatch',
    {
        "slots":{},
        "utterances":[ "{go to|open|open up|display|launch|show} {what to|} watch {now|}", "what to watch {now|}" ]
    },
    function(request,response) {
        var commands = [];
        commands.push("TIVO");
        commands.push("DOWN");
        if(tivoMini) 
            commands.push("DOWN");
        commands.push("RIGHT");
        sendCommands(commands);
    });

// CONTROL

app.intent('ChangeChannel',
    {
        "slots":{"TIVOCHANNEL":"NUMBER","TIVOBOXRM":"AMAZON.Room"},
        "utterances":[ "{change|go to} channel {to|} {1-100|TIVOCHANNEL} {in +TIVOBOXRM+|on +TIVOBOXRM+|}" ]
    },
    function(request,response) {
	var commands = [];
	lastTivoBox = tivoIndex;
	tivoboxrm = request.slot("TIVOBOXRM");
	
	setTivoRoom(tivoboxrm);
        if(tivoMini) {
            for(pos = 0 ; pos < request.slot("TIVOCHANNEL").length ; pos++) 
	        commands.push("NUM"+request.slot("TIVOCHANNEL").substring(pos,pos+1));
            commands.push("ENTER");
        }
        else {
	    commands.push("SETCH "+request.slot("TIVOCHANNEL"));
        }
	return sendCommands(commands, true);
    });

app.intent('PutOn',
    {
        "slots":{"CHANNELNAME":"AMAZON.TelevisionChannel","TIVOBOXRM":"AMAZON.Room"},
		"utterances":[ "put {on|} {-|CHANNELNAME} {in +TIVOBOXRM+|on +TIVOBOXRM+|}" ]
    },
    function(request,response) {
	var commands = [];
	var chnl = String(request.slot("CHANNELNAME"));
	chnl = chnl.toLowerCase();
	var chnlnum = String(channels[chnl]);
	console.log("Requested to put on channel: " + chnlnum);
    lastTivoBox = tivoIndex;
	tivoboxrm = request.slot("TIVOBOXRM");
	
	setTivoRoom(tivoboxrm);
	
	if (typeof channels[chnl] != 'undefined' ) {
		if(tivoMini) {
			for(pos = 0; pos < chnlnum.length; pos++){
				commands.push("NUM" + chnlnum.substring(pos,pos+1));
				commands.push("ENTER");
			}
		}
		else {
			commands.push("SETCH " + chnlnum);
		}
		return sendCommands(commands, true);
	}
	else {
		console.log("Undefined channel: " + chnl);
		response.say(strings.txt_undefinedchannel + chnl + strings.txt_undefinedchannel2);
	}
	});
	
app.intent('ForceChannel',
    {
        "slots":{"TIVOCHANNEL":"NUMBER","TIVOBOXRM":"AMAZON.Room"},
        "utterances":[ "force channel {to|} {1-100|TIVOCHANNEL} {in +TIVOBOXRM+|on +TIVOBOXRM+|}" ]
    },
    function(request,response) {
	var commands = [];
	lastTivoBox = tivoIndex;
	tivoboxrm = request.slot("TIVOBOXRM");
	
	setTivoRoom(tivoboxrm);
	
        if(tivoMini) {
            for(pos = 0 ; pos < request.slot("TIVOCHANNEL").length ; pos++) 
	        commands.push("NUM"+request.slot("TIVOCHANNEL").substring(pos,pos+1));
            commands.push("ENTER");
        }
        else {
	    commands.push("FORCECH "+request.slot("TIVOCHANNEL"));
        }
	return sendCommands(commands, true);
    });

app.intent('LastChannel',
    {
        "slots":{},
        "utterances":[ "{for|} {last|previous} {channel|}" ]
    },
    function(request,response) {
        var commands = [];
        commands.push("ENTER");
        sendCommands(commands);
    });

app.intent('Pause',
    {
        "slots":{},
        "utterances":[ "pause" ]
    },
    function(request,response) {
        var commands = [];
        commands.push("PAUSE");
        sendCommands(commands);
    });

app.intent('Play',
    {
        "slots":{},
        "utterances":[ "play" ]
    },
    function(request,response) {
        var commands = [];
        commands.push("PLAY");
        sendCommands(commands);
    });

app.intent('Info',
    {
        "slots":{},
        "utterances":[ "{for|} info" ]
    },
    function(request,response) {
        var commands = [];
        commands.push("INFO");
        sendCommands(commands);
    });

app.intent('FastForward',
    {
        "slots":{},
        "utterances":[ "fast forward" ]
    },
    function(request,response) {
        var commands = [];
        commands.push("FORWARD");
        sendCommands(commands);
    });

app.intent('FastForwardDouble',
    {
        "slots":{},
        "utterances":[ "{double fast forward|fast forward two x|fast forward two times}" ]
    },
    function(request,response) {
        var commands = [];
        commands.push("FORWARD");
        commands.push("FORWARD");
        sendCommands(commands);
    });

app.intent('FastForwardTriple',
    {
        "slots":{},
        "utterances":[ "{triple fast forward|fast forward three x|fast forward three times}" ]
    },
    function(request,response) {
        var commands = [];
        commands.push("FORWARD");
        commands.push("FORWARD");
        commands.push("FORWARD");
        sendCommands(commands);
    });


app.intent('SkipAhead',
    {
        "slots":{},
        "utterances":[ "{skip|advance} {forward|ahead}" ]
    },
    function(request,response) {
        var commands = [];
        commands.push("ADVANCE");
        sendCommands(commands);
    });

app.intent('SkipCommerial',
    {
        "slots":{},
        "utterances":[ "skip {the|} {this|} {commercial|commercials}" ]
    },
    function(request,response) {
        var commands = [];
        commands.push("ACTION_D");
        sendCommands(commands);
    });

app.intent('Rewind',
    {
        "slots":{},
        "utterances":[ "rewind" ]
    },
    function(request,response) {
        var commands = [];
        commands.push("REVERSE");
        sendCommands(commands);
    });

app.intent('RewindDouble',
    {
        "slots":{},
        "utterances":[ "{double rewind|rewind two x|rewind two times}" ]
    },
    function(request,response) {
        var commands = [];
        commands.push("REVERSE");
        commands.push("REVERSE");
        sendCommands(commands);
    });

app.intent('RewindTriple',
    {
        "slots":{},
        "utterances":[ "{triple rewind|rewind three x|rewind three times}" ]
    },
    function(request,response) {
        var commands = [];
        commands.push("REVERSE");
        commands.push("REVERSE");
        commands.push("REVERSE");
        sendCommands(commands);
    });

app.intent('Replay',
    {
        "slots":{},
        "utterances":[ "replay" ]
    },
    function(request,response) {
        var commands = [];
        commands.push("REPLAY");
        commands.push("REPLAY");
        sendCommands(commands);
    });

app.intent('Record',
    {
        "slots":{},
        "utterances":[ "record {this|} {show|}", "record the current show" ]
    },
    function(request,response) {
        var commands = [];
        commands.push("RECORD");
        commands.push("RIGHT");
        sendCommands(commands);
    });

// FEATURES

app.intent('CaptionsOn',
    {
        "slots":{},
        "utterances":[ "{turn on|enable} {closed captions|captions}" ]
    },
    function(request,response) {
        var commands = [];
        commands.push("CC_ON");
        sendCommands(commands);
    });

app.intent('CaptionsOff',
    {

        "slots":{},
        "utterances":[ "{turn off|disable} {closed captions|captions}" ]
    },
    function(request,response) {
        var commands = [];
        commands.push("CC_OFF");
        sendCommands(commands);
    });

app.intent('QuickMode',
    {
        "slots":{},
        "utterances":[ "{turn on|turn off|enable|disable|toggle} quick mode" ]
    },
    function(request,response) {
        var commands = [];
        commands.push("PLAY");
        commands.push("SELECT");
        commands.push("CLEAR");
        sendCommands(commands);
    });

app.intent('ThumbsUp',
    {

        "slots":{},
        "utterances":[ "thumbs up" ]
    },
    function(request,response) {
        var commands = [];
        commands.push("THUMBSUP");
        sendCommands(commands);
    });

app.intent('ThumbsDown',
    {

        "slots":{},
        "utterances":[ "thumbs down" ]
    },
    function(request,response) {
        var commands = [];
        commands.push("THUMBSDOWN");
        sendCommands(commands);
    });

// ADVANCED

app.intent('SendCommand',
    {
        "slots":{"TIVOCOMMAND":"TIVOCOMMAND_SLOT"},
        "utterances":[ "send {the command|command} {-|TIVOCOMMAND}", "send {the|} {-|TIVOCOMMAND} {command}", "send {-|TIVOCOMMAND}" ]
    },
    function(request,response) {
        var commands = [];
        commands.push(request.slot("TIVOCOMMAND").toUpperCase());
        sendCommands(commands);
    });

// VIDEO PROVIDERS

app.intent('HBOGo',
    {
        "slots":{},
        "utterances":[ "{go to|open|turn on|open up|display|jump to|launch} hbo go" ]
    },
    function(request,response) {
        if (checkProviderEnabled(strings.hbogo)) {
            response.say("Launching " + strings.hbogo);
            var commands = [];
            commands = addInitCommands(commands);
            commands = openMediaCommands(commands);
            commands = buildProviderNavigation(strings.hbogo, commands);
            sendCommands(commands);
        }
        else {
            response.say(strings.hbogo + strings.txt_notenabled);
		}
    });

app.intent('Xfinity',
    {
        "slots":{},
        "utterances":[ "{go to|open|turn on|open up|display|jump to|launch} {xfinity|on demand} {on demand|}" ]
    },
    function(request,response) {
        if (checkProviderEnabled(strings.xfinityondemand)) {
            response.say("Launching " + strings.xfinityondemand);
            var commands = [];
            commands = addInitCommands(commands);
            commands = openMediaCommands(commands);
            commands = buildProviderNavigation(strings.xfinityondemand, commands);
            sendCommands(commands);
        }
        else {
            response.say(strings.xfinityondemand + strings.txt_notenabled);
		}
    });

app.intent('Amazon',
    {
        "slots":{},
        "utterances":[ "{go to|open|turn on|open up|display|jump to|launch|} amazon {video|}" ]
    },
    function(request,response) {
        if (checkProviderEnabled(strings.amazon)) {
            response.say("Launching " + strings.amazon);
            var commands = [];
            commands = addInitCommands(commands);
            commands = openMediaCommands(commands);
            commands = buildProviderNavigation(strings.amazon, commands);
            sendCommands(commands);
        }
        else {
            response.say(strings.amazon + strings.txt_notenabled);
		}
    });

app.intent('Netflix',
    {
        "slots":{},
        "utterances":[ "{go to|open|turn on|open up|display|jump to|launch|} netflix" ]
    },
    function(request,response) {
        if (checkProviderEnabled(strings.netflix)) {
            response.say("Launching " + strings.netflix);
            var commands = [];
            commands = addInitCommands(commands);
            commands = openMediaCommands(commands);
            commands = buildProviderNavigation(strings.netflix, commands);
            sendCommands(commands);
        }
        else {
            response.say(strings.netflix + strings.txt_notenabled);
		}
    });
	
app.intent('Hulu',
    {
        "slots":{},
        "utterances":[ "{go to|open|turn on|open up|display|jump to|launch|} hulu" ]
    },
    function(request,response) {
        if (checkProviderEnabled(strings.hulu)) {
            response.say("Launching " + strings.hulu);
            var commands = [];
            commands = addInitCommands(commands);
            commands = openMediaCommands(commands);
            commands = buildProviderNavigation(strings.hulu, commands);
            sendCommands(commands);
        }
        else {
            response.say(strings.hulu + strings.txt_notenabled);
		}
    });
	
app.intent('YouTube',
    {
        "slots":{},
        "utterances":[ "{go to|open|turn on|open up|display|jump to|launch|} youtube" ]
    },
    function(request,response) {
        if (checkProviderEnabled(strings.youtube)) {
            response.say("Launching " + strings.youtube);
            var commands = [];
            commands = addInitCommands(commands);
            commands = openMediaCommands(commands);
            commands = buildProviderNavigation(strings.youtube, commands);
            sendCommands(commands);
        }
        else {
            response.say(strings.youtube + strings.txt_notenabled);
		}
    });
	
app.intent('MLBTV',
    {
        "slots":{},
        "utterances":[ "{go to|open|turn on|open up|display|jump to|launch|} {the|} {mlb|baseball|mlb tv|major league baseball|major league baseball tv}" ]
    },
    function(request,response) {
        if (checkProviderEnabled(strings.mlbtv)) {
            response.say("Launching " + strings.mlbtv);
            var commands = [];
            commands = addInitCommands(commands);
            commands = openMediaCommands(commands);
            commands = buildProviderNavigation(strings.mlbtv, commands);
            sendCommands(commands);
        }
        else {
            response.say(strings.mlbtv + strings.txt_notenabled);
		}
    });
	
app.intent('Plex',
    {
        "slots":{},
        "utterances":[ "{go to|open|turn on|open up|display|jump to|launch|} plex" ]
    },
    function(request,response) {
        if (checkProviderEnabled(strings.plex)) {
            response.say("Launching " + strings.plex);
            var commands = [];
            commands = addInitCommands(commands);
            commands = openMediaCommands(commands);
            commands = buildProviderNavigation(strings.plex, commands);
            sendCommands(commands);
        }
        else {
            response.say(strings.plex + strings.txt_notenabled);
		}
    });
	
app.intent('VUDU',
    {
        "slots":{},
        "utterances":[ "{go to|open|turn on|open up|display|jump to|launch|} {vudu|voodoo}" ]
    },
    function(request,response) {
        if (checkProviderEnabled(strings.vudu)) {
            response.say("Launching " + strings.vudu);
            var commands = [];
            commands = addInitCommands(commands);
            commands = openMediaCommands(commands);
            commands = buildProviderNavigation(strings.vudu, commands);
            sendCommands(commands);
        }
        else {
            response.say(strings.vudu + strings.txt_notenabled);
		}
    });
	
app.intent('HSN',
    {
        "slots":{},
        "utterances":[ "{go to|open|turn on|open up|display|jump to|launch|} {hsn|home shopping network|shopping}" ]
    },
    function(request,response) {
        if (checkProviderEnabled(strings.hsn)) {
            response.say("Launching " + strings.hsn);
            var commands = [];
            commands = addInitCommands(commands);
            commands = openMediaCommands(commands);
            commands = buildProviderNavigation(strings.hsn, commands);
            sendCommands(commands);
        }
        else {
            response.say(strings.hsn + strings.txt_notenabled);
		}
    });
	
app.intent('ALTChannel',
    {
        "slots":{},
        "utterances":[ "{go to|open|turn on|open up|display|jump to|launch|} {alt|alt channel}" ]
    },
    function(request,response) {
        if (checkProviderEnabled(strings.alt)) {
            response.say("Launching " + strings.alt);
            var commands = [];
            commands = addInitCommands(commands);
            commands = openMediaCommands(commands);
            commands = buildProviderNavigation(strings.alt, commands);
            sendCommands(commands);
        }
        else {
            response.say(strings.alt + strings.txt_notenabled);
		}
    });
	
app.intent('FlixFling',
    {
        "slots":{},
        "utterances":[ "{go to|open|turn on|open up|display|jump to|launch|} flixfling" ]
    },
    function(request,response) {
        if (checkProviderEnabled(strings.flixfling)) {
            response.say("Launching " + strings.flixfling);
            var commands = [];
            commands = addInitCommands(commands);
            commands = openMediaCommands(commands);
            commands = buildProviderNavigation(strings.flixfling, commands);
            sendCommands(commands);
        }
        else {
            response.say(strings.flixfling + strings.txt_notenabled);
		}
    });
	
app.intent('ToonGoggles',
    {
        "slots":{},
        "utterances":[ "{go to|open|turn on|open up|display|jump to|launch|} toon goggles" ]
    },
    function(request,response) {
        if (checkProviderEnabled(strings.toongoggles)) {
            response.say("Launching " + strings.toongoggles);
            var commands = [];
            commands = addInitCommands(commands);
            commands = openMediaCommands(commands);
            commands = buildProviderNavigation(strings.toongoggles, commands);
            sendCommands(commands);
        }
        else {
            response.say(strings.toongoggles + strings.txt_notenabled);
		}
    });
	
app.intent('WWE',
    {
        "slots":{},
        "utterances":[ "{go to|open|turn on|open up|display|jump to|launch|} {wwe|wrestling|world wrestling entertainment}" ]
    },
    function(request,response) {
        if (checkProviderEnabled(strings.wwe)) {
            response.say("Launching " + strings.wwe);
            var commands = [];
            commands = addInitCommands(commands);
            commands = openMediaCommands(commands);
            commands = buildProviderNavigation(strings.wwe, commands);
            sendCommands(commands);
        }
        else {
            response.say(strings.wwe + strings.txt_notenabled);
		}
    });
	
app.intent('Yahoo',
    {
        "slots":{},
        "utterances":[ "{go to|open|turn on|open up|display|jump to|launch|} yahoo" ]
    },
    function(request,response) {
        if (checkProviderEnabled(strings.yahoo)) {
            response.say("Launching " + strings.yahoo);
            var commands = [];
            commands = addInitCommands(commands);
            commands = openMediaCommands(commands);
            commands = buildProviderNavigation(strings.yahoo, commands);
            sendCommands(commands);
        }
        else {
            response.say(strings.yahoo + strings.txt_notenabled);
		}
    });
	
app.intent('YuppTV',
    {
        "slots":{},
        "utterances":[ "{go to|open|turn on|open up|display|jump to|launch|} {yupp|yupp tv|yupptv}" ]
    },
    function(request,response) {
        if (checkProviderEnabled(strings.yupptv)) {
            response.say("Launching " + strings.yupptv);
            var commands = [];
            commands = addInitCommands(commands);
            commands = openMediaCommands(commands);
            commands = buildProviderNavigation(strings.yupptv, commands);
            sendCommands(commands);
        }
        else {
            response.say(strings.yupptv + strings.txt_notenabled);
		}
    });
	
// AUDIO PROVIDERS

app.intent('Pandora',
    {
        "slots":{},
        "utterances":[ "{go to|open|turn on|open up|display|jump to|launch|} pandora", "play {music|music on pandora|pandora}" ]
    },
    function(request,response) {
        if (checkProviderEnabled(strings.pandora)) {
            response.say("Launching " + strings.pandora);
            var commands = [];
            commands = addInitCommands(commands);
            commands = openMusicCommands(commands);
            commands = buildProviderNavigation(strings.pandora, commands);
            sendCommands(commands);
        }
        else {
            response.say(strings.pandora + strings.txt_notenabled);
		}
    });
	
app.intent('Spotify',
    {
        "slots":{},
        "utterances":[ "{go to|open|turn on|open up|display|jump to|launch|} spotify", "play {music|music on|} spotify" ]
    },
    function(request,response) {
        if (checkProviderEnabled(strings.spotify)) {
            response.say("Launching " + strings.spotify);
            var commands = [];
            commands = addInitCommands(commands);
            commands = openMusicCommands(commands);
            commands = buildProviderNavigation(strings.spotify, commands);
            sendCommands(commands);
        }
        else {
            response.say(strings.spotify + strings.txt_notenabled);
		}
    });
	
app.intent('iHeartRadio',
    {
        "slots":{},
        "utterances":[ "{go to|open|turn on|open up|display|jump to|launch|} {iheartradio|i heart radio}", "play {music|music on|} iheartradio" ]
    },
    function(request,response) {
        if (checkProviderEnabled(strings.iheartradio)) {
            response.say("Launching " + strings.iheartradio);
            var commands = [];
            commands = addInitCommands(commands);
            commands = openMusicCommands(commands);
            commands = buildProviderNavigation(strings.iheartradio, commands);
            sendCommands(commands);
        }
        else {
            response.say(strings.iheartradio + strings.txt_notenabled);
		}
    });

app.intent('Vevo',
    {
        "slots":{},
        "utterances":[ "{go to|open|turn on|open up|display|jump to|launch|} {vevo music|music videos}", "play {music|music on|} vevo music" ]
    },
    function(request,response) {
        if (checkProviderEnabled(strings.vevo)) {
            response.say("Launching " + strings.vevo);
            var commands = [];
            commands = addInitCommands(commands);
            commands = openMusicCommands(commands);
            commands = buildProviderNavigation(strings.vevo, commands);
            sendCommands(commands);
        }
        else {
            response.say(strings.vevo + strings.txt_notenabled);
		}
    });

app.intent('PlexMusic',
    {
        "slots":{},
        "utterances":[ "{go to|open|turn on|open up|display|jump to|launch|} {plex music}", "play {music|music on|} plex" ]
    },
    function(request,response) {
        if (checkProviderEnabled(strings.plex_m)) {
            response.say("Launching " + strings.plex_m);
            var commands = [];
            commands = addInitCommands(commands);
            commands = openMusicCommands(commands);
            commands = buildProviderNavigation(strings.plex_m, commands);
            sendCommands(commands);
        }
        else {
            response.say(strings.plex_m + strings.txt_notenabled);
		}
    });

// functions -----------------------------------------------------------

function sendNextCommand () {

    clearInterval(interval);
    if(queuedCommands.length == 0) {
	// the queue is empty, disconnect
        if(typeof telnetSocket != "undefined" && typeof telnetSocket.end != "undefined") {
            telnetSocket.end();
            telnetSocket.destroy();
			console.log("Connection Closed");
			if(lastTivoBox != tivoIndex) {
				setLastTivo();
			}
		}
        socketOpen = false;
    }
    else {
        var command = queuedCommands.shift();
        var timeToWait = 300;
        if(queuedCommands[0] == "RIGHT" || queuedCommands[0] == "ENTER") {
	    // wait slightly longer to allow for screen changes
            if(tivoMini) {
                timeToWait = 1100;
            } else {
                timeToWait = 800;
			}
		}
	
		if(typeof command == "object" && typeof command["explicit"] != "undefined") {
			// when explicit is true, send the full command as passed
			console.log("Sending Explicit Command: " + command["command"].toUpperCase());
			telnetSocket.write(command["command"].toUpperCase() + "\r");
			if(command.indexOf("TELEPORT")) {
				timeToWait = 700;
			}
		} else {
			// when explicit is false, add the proper command prefix (IRCODE, KEYBOARD, etc.)
			if(typeof command == "object") {
				command = command["command"];
			}
		
			var prefix = determinePrefix(command);
			if(prefix === false) {
				console.log("ERROR: Command Not Supported: " + command);
				telnetSocket.end();
			}
			else {
				console.log("Sending Prefixed Command: "+prefix + " " + command.toUpperCase());
				telnetSocket.write(prefix + " " + command.toUpperCase() + "\r");
			}
			if(prefix == "TELEPORT") {
				timeToWait = 700;
			}
		}
		setTimeout(sendNextCommand, timeToWait);
	}
}

// send a series of queued-up commands to the TiVo (with delays in-between)
function sendCommands(commands) {

    var host = currentTiVoIP;
    var port = currentTiVoPort;

    // move the list of passed-in commands into queuedCommands
    queuedCommands = [];
    for(var i=0; i<commands.length; i++) {
        queuedCommands.push(commands[i]);
    }
    console.log("QueuedCommands: "+queuedCommands.join(","));

    // open the telnet connection to the TiVo
    telnetSocket = net.createConnection({
        port: port,
        host: host
    });

    // log successful connection
    telnetSocket.on('connect', function(data) {
        console.log("Connection Created");
        socketOpen = true;
    });

    // data received back from TiVo (usually indicates command sent during Live TV)
    telnetSocket.on('data', function(data) {
        if(noResponse) {
            noResponse = false;
            console.log("RECEIVED: "+data.toString());
            interval = setInterval(sendNextCommand, 300);
        }
    });

	// timeout; send next command if the connection is still open
	telnetSocket.on('timeout', function(data) {
		console.log("TIMEOUT RECEIVED");
		if(socketOpen) {
			sendNextCommand();
		}
	});

	// connection has been closed
	telnetSocket.on('end', function(data) {
		socketOpen = false;
	});
	noResponse = true;

	setTimeout(function(){
		if(noResponse) {
			setTimeout(sendNextCommand, 700);
		}
	}, 700);
}

// determine prefix for a command
function determinePrefix(command) {
	if(TELEPORT_COMMANDS.indexOf(command) != -1) {
		return "TELEPORT";
	} else if(IRCODE_COMMANDS.indexOf(command) != -1) {
		return "IRCODE";
	} else if(KEYBOARD_COMMANDS.indexOf(command) != -1) {
		return "KEYBOARD";
	} else if ((command.substring(0,5) == "SETCH") || (command.substring(0,7) == "FORCECH")) {
	return "";
	} else {
		return false;
	}
}

// reset to known location (i.e., TiVo Central)
function addInitCommands(commands) {
    commands.push("TIVO");
    return commands;
}

// go to Find TV, Movies, & Videos menu
function openMediaCommands(commands) {
    commands.push("DOWN");
    commands.push("DOWN");
    if(tivoMini) {
        commands.push("DOWN");
    }
    commands.push("RIGHT");
    commands.push("DOWN");
    commands.push("DOWN");
    return commands;
}

// go to Music & Photos menu
function openMusicCommands(commands) {
    commands.push("DOWN");
    commands.push("DOWN");
    commands.push("DOWN");
    commands.push("DOWN");
    if(tivoMini) {
        commands.push("DOWN");
    }
    commands.push("RIGHT");
    return commands;
}

// build dynamic navigation based on which video/audio providers are enabled
function buildProviderNavigation(provider, commands) {

    var provider_loc = video_provider_order.indexOf(provider);
    var audio_provider = false;

    if (provider_loc == -1) {
        audio_provider = true;
        console.log("building navigation for audio provider (" + provider + ")");
        provider_loc = audio_provider_order.indexOf(provider);
        provider_order = audio_provider_order;
        provider_status = audio_provider_status;
    }
    else {
        console.log("building navigation for video provider (" + provider + ")");
        provider_order = video_provider_order;
        provider_status = video_provider_status; 
    }

    for (loc = 0; loc <= provider_loc; loc++) {
        console.log("- " + provider_order[loc] + " (" + provider_status[loc] + ")");
        if (provider_status[loc] == true) {
            // for audio providers, skip the first DOWN command since after pressing
            // RIGHT on the Music menu, the first provider is already highlighted
            if (audio_provider == true) {
                audio_provider = false;
            } else {
                commands.push("DOWN");
            }
		}
	}
    commands.push("RIGHT");
    return commands;
}

// determine if a specified provider is enabled in the configuration file
function checkProviderEnabled(provider) {

    var provider_loc = video_provider_order.indexOf(provider);

    if (provider_loc == -1) {
        console.log("checking status of audio provider (" + provider + ")");
        provider_loc = audio_provider_order.indexOf(provider);
        provider_status = audio_provider_status;
    }
    else {
        console.log("checking status of video provider (" + provider + ")");
        provider_status = video_provider_status; 
    }

    if (provider_status[provider_loc] == true) {
        console.log("- enabled");
    } else {
        console.log("- disabled");
	}

    return provider_status[provider_loc];
}

// generate a list of providers and their status (to be spoken and added to help card)
function createProviderList() {

    speechList = "";
    cardList = "";

    console.log("building list of video providers");
    for (loc = 0; loc < video_provider_order.length; loc++) {
        statusText = " "
        if (video_provider_status[loc] == true) {
            speechList = speechList + ", " + video_provider_order[loc];
            statusText = " (enabled)"
        }
        cardList = cardList + "\n- " + video_provider_order[loc] + statusText;
    }

    console.log("building list of audio providers");
    for (loc = 0; loc < audio_provider_order.length; loc++) {
        statusText = " "
        if (audio_provider_status[loc] == true) {
            speechList = speechList + ", " + audio_provider_order[loc];
            statusText = " (enabled)"
        }
        cardList = cardList + "\n- " + audio_provider_order[loc] + statusText;
    }

    console.log("speech list:\n " + speechList + "\ncard list: " + cardList);

}

// generate a list of TiVo boxes from the config file (to be spoken and added to help card)
function createTiVoBoxList() {

    speechList = "";
    cardList = "";

    console.log("building list of TiVo boxes");
    for (i = 0; i < totalTiVos; i++) {
        speechList = speechList + ", " + config.tivos[i].name;
        cardList = cardList + "\n- " + config.tivos[i].name;
        // indicate default TiVo box
        if (i == 0) {
            cardList = cardList + " (default)";
		}
        // indicate current TiVo box
        if (i == tivoIndex) {
            cardList = cardList + " [current]";
		}
    }

    console.log("speech list:\n " + speechList + "\ncard list: " + cardList);

}

function setTivoRoom(tivoboxrm) {
	if(tivoboxrm != undefined) { 
		console.log("Last Tivo box index: " + tivoIndex);
		currentTiVoBox = tivoboxrm;
		console.log("Control requested for '" + currentTiVoBox + "' TiVo.");
		
		// confirm selected TiVo exists in config.json
		tivoIndex = findTiVoBoxConfig(currentTiVoBox);

		if (tivoIndex < 0) {
			// the requested TiVo doesn't exist in the config file
			console.log("Undefined TiVo requested. Switching back to default.");
			response.say(strings.txt_undefinedtivo);
			tivoIndex = 0;
		}
		else {
			updateCurrentTiVoConfig(tivoIndex);
		}
	}
}

function setLastTivo() {
	console.log("Setting last Tivo");
	tivoIndex = lastTivoBox;
	updateCurrentTiVoConfig(tivoIndex);
}

// find the index of the requested TiVo in the config file
function findTiVoBoxConfig(currentTiVoBox) {

    console.log("Searching for '" + currentTiVoBox +"' in config file ...");
    for (i = 0; i < totalTiVos; i++) {
        if (config.tivos[i].name.toLowerCase() == currentTiVoBox.toLowerCase()) {
            console.log("Found! (" + i + ")");
            return i;
        }
    }

    console.log("Not found!");
    return -1;
}

// update all variables related to the currently selected TiVo
function updateCurrentTiVoConfig(tivoIndex) {

    currentTiVoBox = config.tivos[tivoIndex].name;
    currentTiVoIP = config.tivos[tivoIndex].address;
    currentTiVoPort = config.tivos[tivoIndex].port;
    tivoMini = config.tivos[tivoIndex].mini;

    // update video provider status
    video_provider_status = [config.tivos[tivoIndex].netflix, config.tivos[tivoIndex].amazon, config.tivos[tivoIndex].hbogo, config.tivos[tivoIndex].xfinityondemand, config.tivos[tivoIndex].hulu, config.tivos[tivoIndex].youtube, config.tivos[tivoIndex].mlbtv, config.tivos[tivoIndex].plex, config.tivos[tivoIndex].vudu, config.tivos[tivoIndex].hsn, config.tivos[tivoIndex].alt, config.tivos[tivoIndex].flixfling, config.tivos[tivoIndex].toongoggles, config.tivos[tivoIndex].wwe, config.tivos[tivoIndex].yahoo, config.tivos[tivoIndex].yupptv];
 
    // update audio provider status
    audio_provider_status = [config.tivos[tivoIndex].iheartradio, config.tivos[tivoIndex].pandora, config.tivos[tivoIndex].plex_m, config.tivos[tivoIndex].spotify, config.tivos[tivoIndex].vevo];

    console.log("Currently controlling: " + currentTiVoBox + " (" + currentTiVoIP + ")");
}

// generate a list of channels defined in channels.json (for changing by channel name)
function createChannelList(genre) {

    speechList = "";
    cardList = "";
    channelName = "";
    var linecount = 0;

    console.log("building list of defined channels");
    console.log("Genre: " + genre );
    for (channelName in chnllist) {
		if (linecount == 97 ) {
			console.log("Channel list is too long.");
			speechList = speechList + ", " + "Channel list exceeds card maximum length. Try listing channels by genre.";
			cardList = cardList + "\n\n\nChannel list exceeds card maximum length. Try listing channels by genre...";
			return
		}
		
		if ( chnllist[channelName].genre == genre ) {
			linecount++;
			console.log(chnllist[channelName].name + " (" + chnllist[channelName].channel + ")");
			speechList = speechList + ", " + chnllist[channelName].pronounce;
			// uppercase the channel names for a consistent look on the card, and include channel number
			cardList = cardList + "\n- " + chnllist[channelName].name.toUpperCase() + " (" + chnllist[channelName].channel + ")";
		} else if ( genres.indexOf(genre) < 0 | genre == "all" ) {
			linecount++;
			console.log(chnllist[channelName].name + " (" + chnllist[channelName].channel + ")");
			speechList = speechList + ", " + chnllist[channelName].pronounce;
			// uppercase the channel names for a consistent look on the card, and include channel number
			cardList = cardList + "\n- " + chnllist[channelName].name.toUpperCase() + " (" + chnllist[channelName].channel + ")";
		}
    }
    console.log("speech list:\n " + speechList + "\ncard list: " + cardList);

}

module.exports = app;
