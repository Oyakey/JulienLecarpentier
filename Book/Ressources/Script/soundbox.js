/*
function include(fileName){
  document.write("<script src='"+fileName+"'></script>" );
}

include("./Tools/howler.js-master/dist/howler.js");
include("./Tools/jquery-3.1.1.js");

var sound = new Howl({
  src: ['drum_1.mp3']
});

var drum1 = $('#drum1');

var playing = false;
var setloop;

play.click(function e(){

	if (!playing) {
		sound.play();

		setloop = setInterval(function (a) {
			sound.play();
		},3788);

		playing = true;
	}

	else {
		clearInterval(setloop);

		playing = false;
	}

});
*/