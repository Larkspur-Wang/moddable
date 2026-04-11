import AudioOut from "embedded:io/audio/out-original";
import StickS3Board from "sticks3/board";

export default class StickS3IOAudioOut extends AudioOut {
	constructor(options = {}) {
		const settings = StickS3Board.ioSpeakerOptions(options);
		StickS3Board.acquireSpeaker();

		let constructed = false;
		try {
			super(settings);
			constructed = true;
			this._stickS3Closed = false;
		}
		finally {
			if (!constructed)
				StickS3Board.releaseSpeaker();
		}
	}

	close() {
		if (this._stickS3Closed)
			return;

		this._stickS3Closed = true;
		try {
			super.close();
		}
		finally {
			StickS3Board.releaseSpeaker();
		}
	}
}
