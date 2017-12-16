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

// load settings from config file
var route = config.route || "tivo_control";

// set apps order
var apps_order = [strings.netflix, strings.amazon, strings.hbogo, strings.hulu, strings.xfinityondemand, strings.youtube, strings.epix, strings.vudu, strings.plex, strings.mlbtv, strings.wwe, strings.ameba, strings.toongoggles, strings.alt, strings.flixfling, strings.hsn, strings.ign, strings.tastemade, strings.tubi, strings.vevo, strings.yahoo, strings.yupptv, strings.vewd, strings.baeble, strings.iheartradio, strings.pandora];

// define variables
var queuedCommands = [];
var telnetSocket;
var socketOpen = false;
var interval;
var noResponse = true;
var apps_status;
var speechList = "";
var cardList = "";
var tivoIndex = 0;
var totalTiVos = Object.keys(config.tivos).length;
var lastTivoBox = tivoIndex;
var channelName = ""; 
var tivoBoxRoom = "";
var roomFound = false;
var genres = strings["genres"];
var hydraUI = false;

// macro setup (if enabled)
var macros = "";
var totalMacros = 0;
if (config.macros) {
    macros = require("./macros.json");
    totalMacros = Object.keys(macros).length;
    console.log("User-defined macros enabled (" + totalMacros + " found).");
}

// set default TiVo (first one in config file)
updateCurrentTiVoConfig(tivoIndex);

// define an alexa-app
var app = new alexa.app(route);

// verify appId for incoming request
app.pre = function(request,response,type) {
    if (request.hasSession()) {
        var session = request.getSession();
        if (session.details.application.applicationId!=config.alexaAppId &&
            session.details.application.applicationId!=strings.alexaTestAppId) {
            response.fail("An invalid applicationId was received.");
        }
    }
};

// general error handling
app.error = function(exception, request, response) {
    console.log(exception);
    response.say("Sorry, an error has occured. Please try your request again.");
};

// command-grouping arrays ---------------------------------------------

var IRCODE_COMMANDS = ["UP", "DOWN", "LEFT", "RIGHT", "SELECT", "TIVO", "LIVETV", "GUIDE", "INFO", "EXIT", "THUMBSUP", "THUMBSDOWN", "CHANNELUP", "CHANNELDOWN", "MUTE", "VOLUMEUP", "VOLUMEDOWN", "TVINPUT", "VIDEO_MODE_FIXED_480i", "VIDEO_MODE_FIXED_480p", "VIDEO_MODE_FIXED_720p", "VIDEO_MODE_FIXED_1080i", "VIDEO_MODE_HYBRID", "VIDEO_MODE_HYBRID_720p", "VIDEO_MODE_HYBRID_1080i", "VIDEO_MODE_NATIVE", "CC_ON", "CC_OFF", "OPTIONS", "ASPECT_CORRECTION_FULL", "ASPECT_CORRECTION_PANEL", "ASPECT_CORRECTION_ZOOM", "ASPECT_CORRECTION_WIDE_ZOOM", "PLAY", "FORWARD", "REVERSE", "PAUSE", "SLOW", "REPLAY", "ADVANCE", "RECORD", "NUM0", "NUM1", "NUM2", "NUM3", "NUM4", "NUM5", "NUM6", "NUM7", "NUM8", "NUM9", "ENTER", "CLEAR", "ACTION_A", "ACTION_B", "ACTION_C", "ACTION_D", "BACK", "WINDOW", "NETFLIX"];

var KEYBOARD_COMMANDS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "MINUS", "EQUALS", "LBRACKET", "RBRACKET", "BACKSLASH", "SEMICOLON", "QUOTE", "COMMA", "PERIOD", "SLASH", "BACKQUOTE", "SPACE", "KBDUP", "KBDDOWN", "KBDLEFT", "KBDRIGHT", "PAGEUP", "PAGEDOWN", "HOME", "END", "CAPS", "LSHIFT", "RSHIFT", "INSERT", "BACKSPACE", "DELETE", "KBDENTER", "STOP", "VIDEO_ON_DEMAND"];

var TELEPORT_COMMANDS = ["TIVO", "GUIDE", "NOWPLAYING"];

// custom slots --------------------------------------------------------

app.customSlot("TIVOCOMMAND_SLOT", ["UP", "DOWN", "LEFT", "RIGHT", "SELECT", "TIVO", "THUMBSUP", "THUMBSDOWN", "CHANNELUP", "CHANNELDOWN", "MUTE", "VOLUMEDOWN", "VOLUMEUP", "TVINPUT", "OPTIONS", "RECORD", "DISPLAY", "DIRECTV", "ENTER", "CLEAR", "PLAY", "PAUSE", "SLOW", "FORWARD", "REVERSE", "STANDBY", "NOWSHOWING", "REPLAY", "ADVANCE", "BACK", "WINDOW", "GUIDE", "EXIT", "STOP", "DELIMITER", "KBDUP", "KBDDOWN", "KBDLEFT", "KBDRIGHT", "PAGEUP", "PAGEDOWN", "HOME", "END", "SPACE", "BACKQUOTE", "SLASH", "PERIOD", "COMMA", "QUOTE", "SEMICOLON", "BACKSLASH", "RBRACKET", "LBRACKET", "EQUALS", "MINUS", "CAPS", "LSHIFT", "RSHIFT", "INSERT", "BACKSPACE", "DELETE", "KBDENTER", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "NUM0", "NUM1", "NUM2", "NUM3", "NUM4", "NUM5", "NUM6", "NUM7", "NUM8", "NUM9", "ACTION_A", "ACTION_B", "ACTION_C", "ACTION_D"]);

// launch --------------------------------------------------------------

app.launch(function(request,response) {
    response.say(strings.txt_welcome + strings.txt_launch);
});

if ((process.argv.length === 3) && (process.argv[2] === 'schema'))  {
    console.log (app.schema ());
    console.log (app.utterances ());
    console.log (app.schemas.skillBuilder ());
}

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

app.intent('ListEnabledApps',
    {
        "slots":{},
        "utterances":[ "{for|to} {my apps|list my apps|app|list apps|app list|list enabled apps}" ]
    },
    function(request,response) {
        console.log("List of enabled applications requested, adding card.");
        createAppList();
        response.say(strings.txt_enabledlist + currentTiVoBox + strings.txt_enabledlist2 + speechList + strings.txt_enabledcard);
        response.card("Apps", strings.txt_appcard + currentTiVoBox + strings.txt_appcard2 + cardList + strings.txt_appfooter);
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
        if (genre == 'undefined') {
            genre = "all";
            createChannelList(genre);
        } else if (genres.indexOf(genre) < 0) {
            console.log("Genre selected: " + genre);
            response.say("Requested genre not found. Genres available are ." + genres + strings.txt_enabledcard);
            genres = genres.toUpperCase();
            genres = genres.replace(/\,\ /g, "\n- ");
            console.log("List of genres:\n- " + genres);
            response.card("Channel Genres", strings.txt_genrecard + "\n\n- " + genres + strings.txt_genrefooter);
            genres = genres.toLowerCase();
            return
        } else {
            createChannelList(genre);
        }
        response.say(strings.txt_channelscard + genre + strings.txt_channelscard2say + speechList + strings.txt_enabledcard);
        response.card("Channels  (" + genre + ")", strings.txt_channelscard + genre + strings.txt_channelscard2 + cardList + strings.txt_channelsfooter);
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
        genres = genres.replace(/\,\ /g, "\n- ");
        console.log("List of genres:\n- " + genres);
        response.card("Channel Genres", strings.txt_genrecard + "\n\n- " + genres + strings.txt_genrefooter);
        genres = genres.toLowerCase();
    });
	
app.intent('ListMacros',
    {
        "slots":{},
        "utterances":[ "{for|to} {my macros|list my macros|list macros|macros list}" ]
    },
    function(request,response) {
        if (config.macros) {
            console.log("List of macros requested, adding card.");
            speechList = "";
            cardList = "";
            for (i = 0; i < totalMacros; i++) {
                speechList = speechList + macros[i].name + ",";
                cardList = cardList + "\n- \"" + macros[i].name.toUpperCase() + "\" - "  + macros[i].description;
            }
            response.say("Your TiVo Control macros are ." + speechList + strings.txt_enabledcard);
            console.log("List of macros:" + cardList);
            response.card("User Macros", strings.txt_macrocard + cardList + strings.txt_macrocard2);
        }
        else {
            response.say(strings.txt_nomacros);
        }
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
        lastTivoBox = tivoIndex;
        response.say("Currently controlling your " + currentTiVoBox + " Tivo.");
    });

app.intent('WhichTiVoBox',
    {
       "slots":{},
        "utterances":[ "{which|current} {tivo|tivo box|dvr|box}" ]
    },
    function(request,response) {
        console.log("Currently controlling: " + currentTiVoBox + " (" + currentTiVoIP + ")");
        response.say("Currently controlling your " + currentTiVoBox + " Tivo.");
    });

app.intent('ListTiVoBoxes',
    {
        "slots":{},
        "utterances":[ "{for|to} {my tivos|list my tivos|tivo|list tivos|tivo list|list tivo boxes|list boxes}" ]
    },
    function(request,response) {
        console.log("List of TiVo boxes requested, adding card.");
        createTiVoBoxList();
        response.say(strings.txt_tivolistsay + speechList + strings.txt_enabledcard);
        response.card("TiVo Boxes", strings.txt_tivolistcard + cardList + strings.txt_tivofooter);
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
        if (hydraUI) {
            commands.push("NUM0");
            commands.push("DOWN");
            commands.push("DOWN");
            commands.push("SELECT");
        }
        else {
            commands.push("NUM1");
        }
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
        if (hydraUI) {
            commands.push("NUM0");
            commands.push("DOWN");
            commands.push("SELECT");
        }
        else {
            commands.push("NUM2");
        }
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
        if (hydraUI) {
            commands.push("NUM3");
            commands.push("RIGHT");
            commands.push("RIGHT");
            commands.push("RIGHT");
            commands.push("RIGHT");
            commands.push("RIGHT");
            commands.push("DOWN");
            commands.push("SELECT");
        }
        else {
            commands.push("NUM3");
        }
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
        if (hydraUI) {
            commands.push("NUM3");
        }
        else {
            commands.push("NUM4");
        }
        if (TIVOSEARCHREQMOVIE != 'UNDEFINED') {
            console.log("Movie Search");
            for (i = 0; i < TIVOSEARCHREQMOVIE.length; i++) {
                j = i + 1;
                if (TIVOSEARCHREQMOVIE.substring(i, j) == " ") {
                    commands.push("SPACE");
                } else {
                    commands.push(TIVOSEARCHREQMOVIE.substring(i, j));
                }
            }
        }
        if (TIVOSEARCHREQTVSERIES != 'UNDEFINED') {
            console.log("Television Search");
            for (i = 0; i < TIVOSEARCHREQTVSERIES.length; i++) {
                j = i + 1;
                if (TIVOSEARCHREQTVSERIES.substring(i, j) == " ") {
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
        if (TIVOTYPEREQMOVIE != 'UNDEFINED') {
            console.log("Type Movie");
            for (i = 0; i < TIVOTYPEREQMOVIE.length; i++) {
                j = i + 1;
                if (TIVOTYPEREQMOVIE.substring(i, j) == " ") {
                    commands.push("SPACE");
                } else {
                    commands.push(TIVOTYPEREQMOVIE.substring(i, j));
                }
            }
        }
        if (TIVOTYPEREQTVSERIES != 'UNDEFINED') {
            console.log("Type Television");
            for (i = 0; i < TIVOTYPEREQTVSERIES.length; i++) {
                j = i + 1;
                if (TIVOTYPEREQTVSERIES.substring(i, j) == " ") {
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
        if (hydraUI) {
            // Browse has been replaced by What to Watch in the new UI
            commands.push("NUM2");
        }
        else {
            commands.push("NUM5");
        }
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
        if (hydraUI) {
            commands.push("NUM0");
            commands.push("DOWN");
            commands.push("DOWN");
            commands.push("DOWN");
            commands.push("SELECT");
        }
        else {
            commands.push("NUM6");
        }
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
        if (hydraUI) {
            commands.push("NUM2");
        }
        else {
            commands.push("DOWN");
            if (tivoMini) {
                commands.push("DOWN");
            }
            commands.push("RIGHT");
        }
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
        tivoBoxRoom = request.slot("TIVOBOXRM");
        roomFound = setTiVoRoom(tivoBoxRoom, response);

        if (roomFound) {
            if (tivoMini) {
                for (pos = 0 ; pos < request.slot("TIVOCHANNEL").length ; pos++) {
                    commands.push("NUM"+request.slot("TIVOCHANNEL").substring(pos,pos+1));
                }
                commands.push("ENTER");
            }
            else {
	        commands.push("SETCH "+request.slot("TIVOCHANNEL"));
            }
	    return sendCommands(commands, true);
        }
    });

app.intent('PutOn',
    {
        "slots":{"CHANNELNAME":"AMAZON.TelevisionChannel","TIVOBOXRM":"AMAZON.Room"},
        "utterances":[ "put {on|} {-|CHANNELNAME} {in +TIVOBOXRM+|on +TIVOBOXRM+|}" ]
    },
    function(request,response) {
        var commands = [];
        var chnl = String(request.slot("CHANNELNAME"));
        var chnlnum = "";

        chnl = chnl.toLowerCase();
        console.log("Request to put on channel: " + chnl);

        for (channelName in channels) {
            if (channels[channelName].alias == chnl) {
                console.log("found in channels.json (channel: " + channels[channelName].channel + ")");
                chnlnum = channels[channelName].channel;
            }
        }
        
        lastTivoBox = tivoIndex;
        tivoBoxRoom = request.slot("TIVOBOXRM");
        roomFound = setTiVoRoom(tivoBoxRoom, response);

        if (roomFound) {
            if (chnlnum != "") {
                if (tivoMini) {
                    for (pos = 0; pos < chnlnum.length; pos++) {
                        commands.push("NUM" + chnlnum.substring(pos,pos+1));
                    }
                    commands.push("ENTER");
                }
                else {
                    commands.push("SETCH " + chnlnum);
                }
                return sendCommands(commands, true);
            }
            else {
                console.log("Unmapped channel: " + chnl);
                response.say(strings.txt_undefinedchannel + chnl + strings.txt_undefinedchannel2);
                setLastTivo();
            }
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
        tivoBoxRoom = request.slot("TIVOBOXRM");
        setTiVoRoom(tivoBoxRoom, response);

        if (roomFound) {
            if (tivoMini) {
                for (pos = 0 ; pos < request.slot("TIVOCHANNEL").length ; pos++) {
                    commands.push("NUM"+request.slot("TIVOCHANNEL").substring(pos,pos+1));
                }
                commands.push("ENTER");
            }
            else {
                commands.push("FORCECH "+request.slot("TIVOCHANNEL"));
            }
            return sendCommands(commands, true);
        }
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

app.intent('SkipCommercial',
    {
        "slots":{},
        "utterances":[ "skip {the|} {this|} {commercial|commercials}" ]
    },
    function(request,response) {
        var commands = [];
        commands.push("ACTION_D");
        sendCommands(commands);
    });

app.intent('WatchHD',
    {
        "slots":{},
        "utterances":[ "watch {in|} {h.d.|high def}" ]
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
        if (hydraUI) {
            commands.push("SELECT");
            commands.push("SELECT");
        }
        else {
            commands.push("RIGHT");
        }
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

app.intent('ExecuteMacro',
    {
        "slots":{"USERMACRO":"TIVOMACRO_SLOT"},
        "utterances":[ "{run|execute} macro {-|USERMACRO}" ]
    },
    function(request,response) {
        if (config.macros) {
            processMacro(request.slot("USERMACRO").toUpperCase(), response);
        }
        else {
            response.say(strings.txt_nomacros);
        }
    });

// APPS

app.intent('HBOGo',
    {
        "slots":{},
        "utterances":[ "{go to|open|turn on|open up|display|jump to|launch} hbo go" ]
    },
    function(request,response) {
        if (checkAppEnabled(strings.hbogo)) {
            response.say("Launching " + strings.hbogo);
            var commands = [];
            commands = addInitCommands(commands);
            commands = openAppsCommands(commands);
            commands = buildAppNavigation(strings.hbogo, commands);
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
        if (checkAppEnabled(strings.xfinityondemand)) {
            response.say("Launching " + strings.xfinityondemand);
            var commands = [];
            commands = addInitCommands(commands);
            commands = openAppsCommands(commands);
            commands = buildAppNavigation(strings.xfinityondemand, commands);
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
        if (checkAppEnabled(strings.amazon)) {
            response.say("Launching " + strings.amazon);
            var commands = [];
            commands = addInitCommands(commands);
            commands = openAppsCommands(commands);
            commands = buildAppNavigation(strings.amazon, commands);
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
        if (checkAppEnabled(strings.netflix)) {
            response.say("Launching " + strings.netflix);
            var commands = [];
            if (hydraUI) {
                commands.push("NETFLIX");
            }
            else {
                commands = addInitCommands(commands);
                commands = openAppsCommands(commands);
                commands = buildAppNavigation(strings.netflix, commands);
            }
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
        if (checkAppEnabled(strings.hulu)) {
            response.say("Launching " + strings.hulu);
            var commands = [];
            commands = addInitCommands(commands);
            commands = openAppsCommands(commands);
            commands = buildAppNavigation(strings.hulu, commands);
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
        if (checkAppEnabled(strings.youtube)) {
            response.say("Launching " + strings.youtube);
            var commands = [];
            commands = addInitCommands(commands);
            commands = openAppsCommands(commands);
            commands = buildAppNavigation(strings.youtube, commands);
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
        if (checkAppEnabled(strings.mlbtv)) {
            response.say("Launching " + strings.mlbtv);
            var commands = [];
            commands = addInitCommands(commands);
            commands = openAppsCommands(commands);
            commands = buildAppNavigation(strings.mlbtv, commands);
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
        if (checkAppEnabled(strings.plex)) {
            response.say("Launching " + strings.plex);
            var commands = [];
            commands = addInitCommands(commands);
            commands = openAppsCommands(commands);
            commands = buildAppNavigation(strings.plex, commands);
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
        if (checkAppEnabled(strings.vudu)) {
            response.say("Launching " + strings.vudu);
            var commands = [];
            commands = addInitCommands(commands);
            commands = openAppsCommands(commands);
            commands = buildAppNavigation(strings.vudu, commands);
            sendCommands(commands);
        }
        else {
            response.say(strings.vudu + strings.txt_notenabled);
        }
    });

app.intent('EPIX',
    {
        "slots":{},
        "utterances":[ "{go to|open|turn on|open up|display|jump to|launch|} {epics|epix}" ]
    },
    function(request,response) {
        if (checkAppEnabled(strings.epix)) {
            response.say("Launching " + strings.epix);
            var commands = [];
            commands = addInitCommands(commands);
            commands = openAppsCommands(commands);
            commands = buildAppNavigation(strings.epix, commands);
            sendCommands(commands);
        }
        else {
            response.say(strings.epix + strings.txt_notenabled);
        }
    });
	
app.intent('HSN',
    {
        "slots":{},
        "utterances":[ "{go to|open|turn on|open up|display|jump to|launch|} {hsn|home shopping network|shopping}" ]
    },
    function(request,response) {
        if (checkAppEnabled(strings.hsn)) {
            response.say("Launching " + strings.hsn);
            var commands = [];
            commands = addInitCommands(commands);
            commands = openAppsCommands(commands);
            commands = buildAppNavigation(strings.hsn, commands);
            sendCommands(commands);
        }
        else {
            response.say(strings.hsn + strings.txt_notenabled);
        }
    });
	
app.intent('Vevo',
    {
        "slots":{},
        "utterances":[ "{go to|open|turn on|open up|display|jump to|launch|} {vevo music|music videos}", "play {music|music on|} vevo music" ]
    },
    function(request,response) {
        if (checkAppEnabled(strings.vevo)) {
            response.say("Launching " + strings.vevo);
            var commands = [];
            commands = addInitCommands(commands);
            commands = openAppsCommands(commands);
            commands = buildAppNavigation(strings.vevo, commands);
            sendCommands(commands);
        }
        else {
            response.say(strings.vevo + strings.txt_notenabled);
        }
    });

app.intent('ALTChannel',
    {
        "slots":{},
        "utterances":[ "{go to|open|turn on|open up|display|jump to|launch|} {alt|alt channel}" ]
    },
    function(request,response) {
        if (checkAppEnabled(strings.alt)) {
            response.say("Launching " + strings.alt);
            var commands = [];
            commands = addInitCommands(commands);
            commands = openAppsCommands(commands);
            commands = buildAppNavigation(strings.alt, commands);
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
        if (checkAppEnabled(strings.flixfling)) {
            response.say("Launching " + strings.flixfling);
            var commands = [];
            commands = addInitCommands(commands);
            commands = openAppsCommands(commands);
            commands = buildAppNavigation(strings.flixfling, commands);
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
        if (checkAppEnabled(strings.toongoggles)) {
            response.say("Launching " + strings.toongoggles);
            var commands = [];
            commands = addInitCommands(commands);
            commands = openAppsCommands(commands);
            commands = buildAppNavigation(strings.toongoggles, commands);
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
        if (checkAppEnabled(strings.wwe)) {
            response.say("Launching " + strings.wwe);
            var commands = [];
            commands = addInitCommands(commands);
            commands = openAppsCommands(commands);
            commands = buildAppNavigation(strings.wwe, commands);
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
        if (checkAppEnabled(strings.yahoo)) {
            response.say("Launching " + strings.yahoo);
            var commands = [];
            commands = addInitCommands(commands);
            commands = openAppsCommands(commands);
            commands = buildAppNavigation(strings.yahoo, commands);
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
        if (checkAppEnabled(strings.yupptv)) {
            response.say("Launching " + strings.yupptv);
            var commands = [];
            commands = addInitCommands(commands);
            commands = openAppsCommands(commands);
            commands = buildAppNavigation(strings.yupptv, commands);
            sendCommands(commands);
        }
        else {
            response.say(strings.yupptv + strings.txt_notenabled);
        }
    });

app.intent('Vewd',
    {
        "slots":{},
        "utterances":[ "{go to|open|turn on|open up|display|jump to|launch|} {viewed|viewed app store}" ]
    },
    function(request,response) {
        if (checkAppEnabled(strings.vewd)) {
            response.say("Launching " + strings.vewd);
            var commands = [];
            commands = addInitCommands(commands);
            commands = openAppsCommands(commands);
            commands = buildAppNavigation(strings.vewd, commands);
            sendCommands(commands);
        }
        else {
            response.say(strings.vewd + strings.txt_notenabled);
        }
    });

app.intent('AmebaTV',
    {
        "slots":{},
        "utterances":[ "{go to|open|turn on|open up|display|jump to|launch|} {ameba|amoeba|ameba tv|amoeba tv}" ]
    },
    function(request,response) {
        if (checkAppEnabled(strings.ameba)) {
            response.say("Launching " + strings.ameba);
            var commands = [];
            commands = addInitCommands(commands);
            commands = openAppsCommands(commands);
            commands = buildAppNavigation(strings.ameba, commands);
            sendCommands(commands);
        }
        else {
            response.say(strings.ameba + strings.txt_notenabled);
        }
    });

app.intent('TubiTV',
    {
        "slots":{},
        "utterances":[ "{go to|open|turn on|open up|display|jump to|launch|} {tubi|too bee|two be|tubi tv|too bee tv|two be tv}" ]
    },
    function(request,response) {
        if (checkAppEnabled(strings.tubi)) {
            response.say("Launching " + strings.tubi);
            var commands = [];
            commands = addInitCommands(commands);
            commands = openAppsCommands(commands);
            commands = buildAppNavigation(strings.tubi, commands);
            sendCommands(commands);
        }
        else {
            response.say(strings.tubi + strings.txt_notenabled);
        }
    });

app.intent('IGNTV',
    {
        "slots":{},
        "utterances":[ "{go to|open|turn on|open up|display|jump to|launch|} {ign|eye gee enn|i g n|ign tv|eye gee enn tv|i g n tv}" ]
    },
    function(request,response) {
        if (checkAppEnabled(strings.ign)) {
            response.say("Launching " + strings.ign);
            var commands = [];
            commands = addInitCommands(commands);
            commands = openAppsCommands(commands);
            commands = buildAppNavigation(strings.ign, commands);
            sendCommands(commands);
        }
        else {
            response.say(strings.ign + strings.txt_notenabled);
        }
    });

app.intent('TastemadeTV',
    {
        "slots":{},
        "utterances":[ "{go to|open|turn on|open up|display|jump to|launch|} {tastemade|taste made|tastemade tv|taste made tv}" ]
    },
    function(request,response) {
        if (checkAppEnabled(strings.tastemade)) {
            response.say("Launching " + strings.tastemade);
            var commands = [];
            commands = addInitCommands(commands);
            commands = openAppsCommands(commands);
            commands = buildAppNavigation(strings.tastemade, commands);
            sendCommands(commands);
        }
        else {
            response.say(strings.tastemade + strings.txt_notenabled);
        }
    });

app.intent('BaebleMusic',
    {
        "slots":{},
        "utterances":[ "{go to|open|turn on|open up|display|jump to|launch|} {baeble|baeble music|babble|babble music}" ]
    },
    function(request,response) {
        if (checkAppEnabled(strings.baeble)) {
            response.say("Launching " + strings.baeble);
            var commands = [];
            commands = addInitCommands(commands);
            commands = openAppsCommands(commands);
            commands = buildAppNavigation(strings.baeble, commands);
            sendCommands(commands);
        }
        else {
            response.say(strings.baeble + strings.txt_notenabled);
        }
    });

app.intent('Pandora',
    {
        "slots":{},
        "utterances":[ "{go to|open|turn on|open up|display|jump to|launch|} pandora", "play {music|music on pandora|pandora}" ]
    },
    function(request,response) {
        if (checkAppEnabled(strings.pandora)) {
            response.say("Launching " + strings.pandora);
            var commands = [];
            commands = addInitCommands(commands);
            commands = openAppsCommands(commands);
            commands = buildAppNavigation(strings.pandora, commands);
            sendCommands(commands);
        }
        else {
            response.say(strings.pandora + strings.txt_notenabled);
        }
    });
	
app.intent('iHeartRadio',
    {
        "slots":{},
        "utterances":[ "{go to|open|turn on|open up|display|jump to|launch|} {iheartradio|i heart radio}", "play {music|music on|} iheartradio" ]
    },
    function(request,response) {
        if (checkAppEnabled(strings.iheartradio)) {
            response.say("Launching " + strings.iheartradio);
            var commands = [];
            commands = addInitCommands(commands);
            commands = openAppsCommands(commands);
            commands = buildAppNavigation(strings.iheartradio, commands);
            sendCommands(commands);
        }
        else {
            response.say(strings.iheartradio + strings.txt_notenabled);
        }
    });

// functions -----------------------------------------------------------

function sendNextCommand () {

    clearInterval(interval);
    if (queuedCommands.length == 0) {
	// the queue is empty, disconnect
        if (typeof telnetSocket != "undefined" && typeof telnetSocket.end != "undefined") {
            telnetSocket.end();
            telnetSocket.destroy();
            console.log("Connection Closed");
            if (lastTivoBox != tivoIndex) {
                setLastTivo();
            }
        }
        socketOpen = false;
    }
    else {
        var command = queuedCommands.shift();
        var timeToWait = 300;
        if (queuedCommands[0] == "RIGHT" || queuedCommands[0] == "ENTER" || queuedCommands[0] == "LEFT") {
            // wait slightly longer to allow for screen changes
            if (tivoMini) {
                timeToWait = 1100;
            } else {
                timeToWait = 800;
            }
        }
	
        if (typeof command == "object" && typeof command["explicit"] != "undefined") {
            // when explicit is true, send the full command as passed
            console.log("Sending Explicit Command: " + command["command"].toUpperCase());
            telnetSocket.write(command["command"].toUpperCase() + "\r");
            if (command.indexOf("TELEPORT")) {
                timeToWait = 2500;
            }
        } else {
            // when explicit is false, add the proper command prefix (IRCODE, KEYBOARD, etc.)
            if (typeof command == "object") {
                command = command["command"];
            }

            var prefix = determinePrefix(command);
            if (prefix === false) {
                console.log("ERROR: Command Not Supported: " + command);
                telnetSocket.end();
            }
            else {
                console.log("Sending Prefixed Command: "+prefix + " " + command.toUpperCase());
                telnetSocket.write(prefix + " " + command.toUpperCase() + "\r");
            }
            if (prefix == "TELEPORT") {
                timeToWait = 2500;
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
    for (var i=0; i<commands.length; i++) {
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
        if (noResponse) {
            noResponse = false;
            console.log("RECEIVED: "+data.toString());
            interval = setInterval(sendNextCommand, 300);
        }
    });

    // timeout; send next command if the connection is still open
    telnetSocket.on('timeout', function(data) {
    console.log("TIMEOUT RECEIVED");
        if (socketOpen) {
            sendNextCommand();
        }
    });

    // connection has been closed
    telnetSocket.on('end', function(data) {
        socketOpen = false;
    });
    noResponse = true;

    setTimeout(function() {
        if (noResponse) {
            setTimeout(sendNextCommand, 700);
        }
    }, 700);
}

// determine prefix for a command
function determinePrefix(command) {
    if (TELEPORT_COMMANDS.indexOf(command) != -1) {
        return "TELEPORT";
    } else if (IRCODE_COMMANDS.indexOf(command) != -1) {
        return "IRCODE";
    } else if (KEYBOARD_COMMANDS.indexOf(command) != -1) {
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

// go to Apps menu
function openAppsCommands(commands) {
    if (hydraUI) {
        commands.push("NUM4");
        commands.push("LEFT");
        // hack: "pause" a bit to allow screen to update
        commands.push("MUTE");
        commands.push("MUTE");
        commands.push("SELECT");
    }
    else {
        commands.push("DOWN");
        commands.push("DOWN");
        if (tivoMini) {
            commands.push("DOWN");
        }
        commands.push("RIGHT");
    }
    return commands;
}

// build dynamic navigation based on which apps are enabled
function buildAppNavigation(appID, commands) {

    var app_loc = apps_order.indexOf(appID);
    var skipFirst = true;

    console.log("building navigation for app (" + appID + ")");

    for (loc = 0; loc <= app_loc; loc++) {
        console.log("- " + apps_order[loc] + " (" + apps_status[loc] + ")");
        if (apps_status[loc] == true) {
            // skip adding the first command because the selection highlight
            // starts on the first enabled app after going to the Apps menu
            if (!skipFirst) {
                if (hydraUI) {
                    commands.push("RIGHT");
                }
                else {
                    commands.push("DOWN");
                }
            }
            else {
                skipFirst = false;
            }
        }
    }
    if (hydraUI) {
        commands.push("SELECT");
    }
    else {
        commands.push("RIGHT");
    }
    return commands;
}

// determine if a specified app is enabled in the configuration file
function checkAppEnabled(appID) {

    var app_loc = apps_order.indexOf(appID);

    console.log("checking status of app (" + appID + ")");

    if (apps_status[app_loc] == true) {
        console.log("- enabled");
    } else {
        console.log("- disabled");
    }

    return apps_status[app_loc];
}

// generate a list of apps and their status (to be spoken and added to help card)
function createAppList() {

    speechList = "";
    cardList = "";

    console.log("building list of apps");
    for (loc = 0; loc < apps_order.length; loc++) {
        statusText = " "
        if (apps_status[loc] == true) {
            speechList = speechList + ", " + apps_order[loc];
            statusText = " (enabled)"
        }
        cardList = cardList + "\n- " + apps_order[loc] + statusText;
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

function setTiVoRoom(tivoBoxRoom, response) {

    if (tivoBoxRoom != undefined) { 
        console.log("Last TiVo box index: " + tivoIndex);
        currentTiVoBox = tivoBoxRoom;
        console.log("Control requested for '" + currentTiVoBox + "' TiVo.");

        // confirm selected TiVo exists in config.json
        tivoIndex = findTiVoBoxConfig(currentTiVoBox);

        if (tivoIndex < 0) {
            // the requested TiVo doesn't exist in the config file
            console.log("Undefined TiVo requested. Switching back to default.");
            response.say(strings.txt_undefinedtivo + tivoBoxRoom + strings.txt_undefinedtivo2);
            tivoIndex = 0;
            updateCurrentTiVoConfig(tivoIndex);
            return false;
        }
        else {
            updateCurrentTiVoConfig(tivoIndex);
            return true;
        }
    }
    else {
        // no room specified, allow command to go to current tivo
        return true;
    }

}

function setLastTivo() {

    console.log("Setting last TiVo");
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
    hydraUI = config.tivos[tivoIndex].hydra;

    // update apps status
    apps_status = [config.tivos[tivoIndex].netflix, config.tivos[tivoIndex].amazon, config.tivos[tivoIndex].hbogo, config.tivos[tivoIndex].hulu, config.tivos[tivoIndex].xfinityondemand, config.tivos[tivoIndex].youtube, config.tivos[tivoIndex].epix, config.tivos[tivoIndex].vudu, config.tivos[tivoIndex].plex, config.tivos[tivoIndex].mlbtv, config.tivos[tivoIndex].wwe, config.tivos[tivoIndex].ameba, config.tivos[tivoIndex].toongoggles, config.tivos[tivoIndex].alt, config.tivos[tivoIndex].flixfling, config.tivos[tivoIndex].hsn, config.tivos[tivoIndex].ign, config.tivos[tivoIndex].tastemade, config.tivos[tivoIndex].tubi, config.tivos[tivoIndex].vevo, config.tivos[tivoIndex].yahoo, config.tivos[tivoIndex].yupptv, config.tivos[tivoIndex].vewd, config.tivos[tivoIndex].baeble, config.tivos[tivoIndex].iheartradio, config.tivos[tivoIndex].pandora];

    console.log("Currently controlling: " + currentTiVoBox + " (" + currentTiVoIP + ")");
}

// generate a list of channels defined in channels.json (for changing by channel name)
function createChannelList(genre) {

    speechList = "";
    cardList = "";
    channelName = "";
    var linecount = 0;

    console.log("building list of defined channels");
    console.log("Genre: " + genre);
    for (channelName in channels) {
        if (linecount == 97) {
            console.log("Channel list is too long.");
            speechList = speechList + ", " + strings.txt_listtoolong;
            cardList = cardList + "\n\n\n" + strings.txt_listtoolong;
            return
        }
		
        if (channels[channelName].genre == genre) {
            linecount++;
            console.log(channels[channelName].name + " (" + channels[channelName].channel + ")");
            speechList = speechList + ", " + channels[channelName].pronounce;
            // uppercase the channel names for a consistent look on the card, and include channel number
            cardList = cardList + "\n- " + channels[channelName].name.toUpperCase() + " (" + channels[channelName].channel + ")";
        } else if (genres.indexOf(genre) < 0 | genre == "all") {
            linecount++;
            console.log(channels[channelName].name + " (" + channels[channelName].channel + ")");
            speechList = speechList + ", " + channels[channelName].pronounce;
            // uppercase the channel names for a consistent look on the card, and include channel number
            cardList = cardList + "\n- " + channels[channelName].name.toUpperCase() + " (" + channels[channelName].channel + ")";
        }
    }
    console.log("speech list:\n " + speechList + "\ncard list: " + cardList);

}

// retrieve the specified user-defined macro and build command sequence
function processMacro(macroName, response) {

    var macroArray = "";
    var macroCommand = "";
    var waitDelay = 0;
    var commands = [];

    // confirm the requested macro exists in macros.json
    macroIndex = findMacro(macroName);

    if (macroIndex < 0) {
        // the requested macro doesn't exist in the macros file
        response.say(strings.txt_macronotfound + macroName + strings.txt_macronotfound2);
    }
    else {
        response.say("Executing macro " + macroName);
        console.log("Executing macro: " + macroName);
        macroArray = macros[macroIndex].commands.split(',');
        macroArrayCount = macroArray.length;

        // loop through the macro array to build the command sequence
        for (i = 0; i < macroArrayCount; i++) { 
            macroCommand = macroArray[i].trim(); 
            console.log("Command sequence " + i + ": " + macroCommand);
            // check for the SLEEP command (to pause execution)
            if (macroCommand.substring(0,4) == "WAIT") {
                waitDelay = macroCommand.split(" ")[1];
                // this is a hack for now: pad the command queue with MUTE commands
                // to 'simulate' a pause. MUTE doesn't/shouldn't do anything but
                // sending the commands keeps the connection from timing out.
                // The wait time is specified in seconds so convert that into an
                // appropriate number of IRCODE commands to send that will simulate
                // a pausing of the macro for that length of time. In testing, 3
                // IRCODE commands take approximately 1 second.
                waitDelay = parseInt(waitDelay) * 3;
                for (j = 0; j < waitDelay; j++) {
                    commands.push("MUTE");
                }
            }
            else {
                commands.push(macroCommand);
            }
        }

        // execute the macro
        sendCommands(commands);
    }

}

// find the index of the requested macro in the macros file
function findMacro(macroName) {

    console.log("Searching for '" + macroName +"' in macros file ...");
    for (i = 0; i < totalMacros; i++) {
        if (macros[i].name.toUpperCase() == macroName) {
            console.log("Found! (" + i + ")");
            return i;
        }
    }

    console.log("Not found!");
    return -1;
}


module.exports = app;
