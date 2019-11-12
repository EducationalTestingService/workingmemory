/*
  \/\/ () /? /< | |\| (_,   |\/| [- |\/| () /? `/ 
  
  w o r k i n g   m e m o r y
  
  -requires jQuery
  -requires Bacon


  runWorkingMemory()     - invokes a new series of memory trials. 
  resetWorkingMemory()   - resets this tool for another run. In C4, resets are necessary because this code
                           will remain in memory. 
  WorkingMemoryGetData() - returns a simple array of [total-number-of-trials, total-number-correct] 
  WorkingMemoryGetLogs() - return JSON formatted information about each trial

  There is a default configuration. 
  To override any of the default settings pass runWorkingMemory an object of the override values.
  It is not necessary override every setting. 

  stimuli:          (string) "digits" | "letters"  |  (tbd "pictures")
  stimuliInterval:  (number, milliseconds) how long the stimuli is displayed on screen
  direction:        (string) "forward" | "reverse"; the direction a user must recall the stimuli
  instructions:     (object)
    forward:        (string/html) user instructions to be displayed. 
    reverse:        (string/html) user instructions to be displayed. 
    autoAdvance:    (string/html) user instructions to be displayed. 
  feedback:         (string) "none" | "answer" | "correctness"
  feedbackTime:     (number, milliseconds) how long to show feedback
  randomization:    (bool) true. TBD. Future releases may allow predefined sequences.
  numItemsPerTrial: (number) how many stimuli to show (this may be affected by proceedCriteria)
  proceedCriteria:  (object)
    numCorrect:     (number) when the user get this number of correct responses... 
    increaseLength: (number) increase the length by this amount
    numIncorrect:   (number) when the user get this number of incorrect responses... 
    decreaseLength: (number) decrease the length by this amount
  stopType:         (string) "fixed" | "correct" | "incorrect"; when to stop the series of trials   
  stopValue:        (number) 
  advance:          (string) "click" | "auto";  how the user advances to the next trial
  autoAdvanceTime:  (number, milliseconds) time before advancing to next trial
  callback:         (function) callback to invoke when stop is reached
*/


// ----------------------------------------------------------------------- WorkingMemory
(function(win){
    
    win.runWorkingMemory = run;
    win.resetWorkingMemory = reset;
    win.WorkingMemoryGetData = getData;
    win.WorkingMemoryGetLogs = getLogs;


    var DEFAULT_CONFIG = {
        stimuli          : "digits",  
        stimuliInterval  : 1000,
        direction        : "forward",
        instructions     : {forward: "Remember the digits you see,<br/>&nbsp; then recall them in order.", 
                            reverse: "Remember the digits you see,<br />&nbsp; then recall them in <b>reverse</b> order.",
                           autoAdvance: "+"
                           },
        feedback         : "answer",  // 'none', 'answer' or 'correctness'
        feedbackTime     : 3000, 
        randomization    : true,       
        numItemsPerTrial : 4,
        proceedCriteria  : { numCorrect:0, increaseLength:0, numIncorrect:0, decreaseLength:0 },
        stopType         : "fixed", // 'fixed', 'correct', 'incorrect'
        stopValue        : 2,
        advance          : "click",  // 'click', 'auto'
        autoAdvanceTime  : 2000,
        callback         : null
    };

    var BEAT = 500; // time between stimuli, i.e. whitespace

    var cssClasses = { digits:"wmDigitsDisplay", letters:"wmLettersDisplay", pictures:"wmPicturesDisplay" };

    var stimuliItems = {
        digits   : ["0","1","2","3","4","5","6","7","8","9"],
        letters  : ["a","b","c","d","e","f","g","h","i","j","k","l","m",
                   "n","o","p","q","r","s","t","u","v","w","x","y","z"],
        pictures : []
    };

    var uiStream;
    var trialStream;
    var trialCount = 0;
    var stopCriteriaReached = false;
    var numItems = 0;
    var score = [0,0];
    var logs = [];
    var returnData = [];

    // ----------------------------------------------------------------------- reset
    function reset(){

        $(".ui").off();
        trialStream.end();
        stopCriteriaReached = false;
        trialCount = 0;
        numItems = 0;        
        score = [0,0];
        logs = [];
        returnData = [];

        $("#wmCtrlStart").text("start");
        $("#wmCtrlStart").show();
        $("#wmInstructions").removeClass("wmAutoAdvanceInstructions");
    }


    // ----------------------------------------------------------------------- run
    function run(trialConfig){

        var C = makeConfigurationObj(trialConfig);
        $("#wmInstructions").html(C.instructions[C.direction.toLowerCase()]);

        uiStream = $(".ui").asEventStream("click", function(evt){ return evt.currentTarget.id });

        trialStream = new Bacon.Bus();
        
        var stateChanges = trialStream.onValue(function(t){
            switch(t.state){
            case "new":         playPresentation(t);         break;
            case "present-end": playRecall(t);               break;
            case "recall-end":  changeState(t, "complete");  break;
            case "complete":    playNext(t);                 break;
            };
        });
        
        var runControls = uiStream
            .onValue(function(e){
                if(e == "wmCtrlStart" || e == "wmCtrlNext") {
                    var t = makeNewTrial(C);
                    trialStream.push(t)
                }});

        var totals = trialStream
            .filter(function(t){ return (t.state == "recall-end") })
            .scan([0,0], function(arr, t){ 
                arr[0]++;
                if(t.correct){ arr[1]++ };
                return arr;
            }).onValue(function(arr){

                score = arr;

                var n = C.stopValue;
                switch(C.stopType.toLowerCase()){
                case "correct":
                    if(arr[1] == n){ stopCriteriaReached = true; };
                    break;
                case "incorrect":
                    if((arr[0] - arr[1]) == n){ stopCriteriaReached = true; };
                    break;
                case "fixed":
                default:
                    if(arr[0] == n){ stopCriteriaReached = true; };
                };
            })

        var proceed = C.proceedCriteria;
        var proceedScan = trialStream
            .filter(function(t){ return (t.state == "complete") })
            .scan([0, 0, C.numItemsPerTrial], function(arr, t){ 
                if(t.correct){ arr[0]++ }else{ arr[1]++ };
                
                if(proceed["numCorrect"] && proceed["increaseLength"]){
                    if(arr[0] == proceed["numCorrect"]){
                        arr[2] += proceed["increaseLength"];
                        arr[0] = arr[1] = 0; //reset the count;
                    };
                };

                if(proceed["numIncorrect"] && proceed["decreaseLength"]){
                    if(arr[1] == proceed["numIncorrect"]){
                        arr[2] -= proceed["decreaseLength"];
                        arr[0] = arr[1] = 0; //reset the count;
                    };
                    // don't allow count to drop below the start configuration 
                    if(arr[2] < C.numItemsPerTrial){ arr[2] = C.numItemsPerTrial; };
                };
                return arr;
            }).onValue(function(arr){
                numItems = arr[2];
            });


        var loggingAndReturnData = trialStream  
            .filter(function(t){ return (t.state == "recall-end") })
            .onValue(function(t){
                t.log.responseTime = (Date.now() - t.log.recallStart);
                logs.push(t.log);
                returnData.push(t.log.length, t.log.correct);
            });


        IE_fix();
        showScreen('screen-start');
    };
    

    // ----------------------------------------------------------------------- changeState
    function changeState(t, newState){

        t.state = newState;
        trialStream.push(t);
    };
    
    
    // ----------------------------------------------------------------------- makeConfigurationObj
    function makeConfigurationObj(config){
        
        var t = JSON.parse(JSON.stringify(DEFAULT_CONFIG)); //cheap clone
        for(var i in config){ t[i] = config[i]; }; //overwrite
        return t;
    };

    
    // ----------------------------------------------------------------------- makeNewTrial
    function makeNewTrial(config){

        trialCount++;

        var present = makePresentation(config);
        var recall  = makeRecall(config);
        var log = {trialNum:trialCount, 
                   start:Date.now(),
                   direction:config.direction,
                   length:numItems,
                   correct:false,
                   recallStart:0,
                   responseTime:0,
                   stimuli: "",
                   response: "" };

      
        var t = { name:"trial", config:config, present:present, recall:recall, state:"new", correct:false, log:log }


        // auto-score, log
        Bacon.onValues(present, recall, function(p,r){
            if(r.length < 1){ return; }

            //score
            if(t.config.direction.toLowerCase() == "reverse"){ p = p.concat().reverse(); };//use concat to copy
            t.correct = (p.toString() == r.toString())

            //log
            if(r.length == 1 && t.log.responseTime == 0){ t.log.responseTime = (Date.now() - t.log.recallStart); }
            t.log.stimuli  = p.toString();
            t.log.response = r.toString();
            t.log.correct  = t.correct;
        });
        
        return t;
    }

    
    // ----------------------------------------------------------------------- playNext
    function playNext(t){

        if(t.config.feedback.toLowerCase() == "none"){
            if(stopCriteriaReached){
                finished(t);
            }else{
                showScreen('screen-next', t);
            };
        }else{
            showFeedback(t); 
            var time = t.config.feedbackTime;

            if(stopCriteriaReached){
                window.setTimeout(function(){ finished(t); }, time);
            }else{
                window.setTimeout(function(){ showScreen('screen-next', t); }, time);
            };
        };
    };


    // ----------------------------------------------------------------------- makePresentation
    function makePresentation(config){
        
        var time = config.stimuliInterval + BEAT;
        var stimuliArr = stimuliItems[config.stimuli].concat();

        var shuffledArr = shuffle(stimuliArr);
        
        if(numItems > stimuliArr.length){
            shuffledArr = shuffledArr.concat(shuffle(stimuliArr)); // double 
        };
        
        var presentationStream = Bacon.sequentially(time, shuffledArr)
            .take(numItems)
            .scan([], function(arr, str){  arr.push(str); return arr; })
        
        return presentationStream;
    };
    
    
    // ----------------------------------------------------------------------- playPresentation
    function playPresentation(t){

        showScreen("screen-presentation");
        t.present.onValue(function(arr){
            if(arr.length){  showStim(arr[arr.length - 1], t.config); }
        });
        t.present.delay(t.config.stimuliInterval + BEAT).onEnd(function(){ changeState(t, "present-end"); });
    };        


    // ----------------------------------------------------------------------- showStim
    function showStim(stim, t){

        $("#wmPresentation").html("<div class=\"" + cssClasses[t.stimuli] + "\">" + stim  + "</div>");
        window.setTimeout(function(){ $("#wmPresentation").html(""); }, t.stimuliInterval);
    };


    // ----------------------------------------------------------------------- makeRecall
    function makeRecall(t){

        var recallStream = 
            uiStream
            .map(function(id){ 
                return (id.indexOf("Ctrl") != -1) ? id : $("#" + id).text();
            })
            .takeWhile(function(id){
                return (id != "wmCtrlOk");
            })
            .scan([], function(arr, str){
                if(str == "wmCtrlBack"){ return arr.slice(0,-1); };
                if(str == "wmCtrlClear"){ return []; };
                
                arr.push(str);
                return arr;
            })

        return recallStream;
    };

    
    // ----------------------------------------------------------------------- playRecall
    function playRecall(t){

        showScreen("screen-recall", t);
        t.recall.onValue(function(arr){ showRecallDisplay(arr);  });
        t.recall.onEnd(function(){ changeState(t, "recall-end"); });
        t.log.recallStart = Date.now() + 400; //add 400ms to compensate for jQuery's fadeIn()
    };

    
    // ----------------------------------------------------------------------- showRecallDisplay
    function showRecallDisplay(arr){

        $("#wmRecallDisplay").html("");
        for(var i=0; i < arr.length; i++){
            if(arr[i] == "s-recall-end"){return;}
            $("#wmRecallDisplay").append("<span class=\"wmRecallDigitDisplay\">" + arr[i] + "</span>");
        };    
    };


    // ----------------------------------------------------------------------- showFeedback
    function showFeedback(t){

        var type = t.config.feedback.toLowerCase();  // 'answer' or 'correctness'

        $("#wmFeedbackCorrect").hide();
        $("#wmFeedbackIncorrect").hide();
        $("#wmFeedbackAnswer").html(""); 

        if(t.correct){
            $("#wmFeedbackCorrect").show();
        }else{
            $("#wmFeedbackIncorrect").show();
        };

        if(type == "answer"){
            t.present.onValue(function(arr){
                if(t.config.direction.toLowerCase() == "reverse"){ arr = arr.concat().reverse(); };
                $("#wmFeedbackAnswer").html("The correct answer is: " + arr.join("&nbsp;"));
            });
        };
        
        showScreen("screen-feedback");
    }


    // ----------------------------------------------------------------------- showScreen
    function showScreen(s, t){
        
        $("#wmStartScreen").hide();
        $("#wmPresentation").hide();
        $("#wmRecall").hide();
        $("#wmFeedback").hide();
        
        $("#wmDigits").hide();
        $("#wmLetters").hide();
        $("#wmPictures").hide();

        switch(s){
        case "screen-start":
            $("#wmStartScreen").show();
            break;
            
        case "screen-presentation":
            $("#wmStartScreen").show().fadeOut({"complete":function(){$("#wmPresentation").show();}});
            break;
            
        case "screen-recall":
            $("#wmRecall").fadeIn();
            if(t.config.stimuli == "digits"){  $("#wmDigits").show();  }
            if(t.config.stimuli == "letters"){ $("#wmLetters").show(); }
            break;

        case "screen-feedback":
            $("#wmFeedback").fadeIn();
            break;

        case "screen-next":
            if(t.config.advance == "auto"){
                $("#wmInstructions").html(t.config.instructions.autoAdvance);
                $("#wmInstructions").addClass("wmAutoAdvanceInstructions");
                $("#wmCtrlStart").hide();
                window.setTimeout(function(){$("#wmCtrlStart").trigger("click"); }, t.config.autoAdvanceTime);
            }
            
            if(t.config.advance == "click"){
                $("#wmCtrlStart").text("next");
            }
            
            $("#wmStartScreen").fadeIn();
            break;
        };
    };


    // ----------------------------------------------------------------------- shuffle
    // Fisher-Yates shuffle algorithm 
    
    function shuffle(arr) {

        arr = arr.concat(); //make copy
        var m = arr.length, t, i;
        
        // While there remain elements to shuffle...
        while (m) {
            
            // Pick a remaining element...
            i = Math.floor(Math.random() * m--);
            
            // And swap it with the current element.
            t = arr[m];
            arr[m] = arr[i];
            arr[i] = t;
        }
        
        return arr;
    }
    

    // ----------------------------------------------------------------------- IE_fix
    function IE_fix(){

        // css :active is not triggered by child elements in any version of IE
        // but the icon buttons have child spans, so..
        // use jQuery toggle instead
        $(".wmBlkButton").on("mousedown mouseup mouseleave", function(e){
            $(this).toggleClass("active", e.type === "mousedown");
        });
    };


    // ----------------------------------------------------------------------- finished
    function finished(t){

        if(t.config.callback && typeof(t.config.callback) == "function"){
            t.config.callback.call(window, t);
        }else{
            alert('done');
        }
    }


    // ----------------------------------------------------------------------- getData
    function getData(){

        return returnData;
    }        


    // ----------------------------------------------------------------------- getLogs
    function getLogs(){

        return JSON.stringify(logs);
    }        

    
})(window);
