function playSound(soundfile) {

	document.getElementById("soundbox").innerHTML= "<embed src=\""+soundfile+"\" hidden=\"true\" autostart=\"true\" loop=\"true\" />";

}

function stopSound(soundfile) {

	document.getElementById("soundbox").innerHTML= "<embed src=\""+soundfile+"\" hidden=\"true\" autostart=\"true\" loop=\"true\" />";

}