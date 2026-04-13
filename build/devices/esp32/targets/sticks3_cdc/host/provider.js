/*
 * Copyright (c) 2022  Moddable Tech, Inc.
 *
 *   This file is part of the Moddable SDK Runtime.
 *
 *   The Moddable SDK Runtime is free software: you can redistribute it and/or modify
 *   it under the terms of the GNU Lesser General Public License as published by
 *   the Free Software Foundation, either version 3 of the License, or
 *   (at your option) any later version.
 *
 *   The Moddable SDK Runtime is distributed in the hope that it will be useful,
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *   GNU Lesser General Public License for more details.
 *
 *   You should have received a copy of the GNU Lesser General Public License
 *   along with the Moddable SDK Runtime.  If not, see <http://www.gnu.org/licenses/>.
 *
 */

import Analog from "embedded:io/analog";
import Digital from "embedded:io/digital";
import DigitalBank from "embedded:io/digitalbank";
import I2C from "embedded:io/i2c";
// import PulseCount from "embedded:io/pulsecount";
import PWM from "embedded:io/pwm";
import Serial from "embedded:io/serial";
import SMBus from "embedded:io/smbus";
import SPI from "embedded:io/spi";

const device = {
	I2C: {
		default: {
			io: I2C,
			data: 47,
			clock: 48
		},
		internal: {
			io: I2C,
			data: 47,
			clock: 48
		},
		grove: {
			io: I2C,
			data: 9,
			clock: 10
		}
	},
	Serial: {
		default: {
			io: Serial,
			port: 0,
			receive: 44,
			transmit: 43
		}
	},
	SPI: {
		default: {
			io: SPI,
			port: 1,
			clock: 40,
			out: 39
		},
		display: {
			io: SPI,
			port: 1,
			clock: 40,
			out: 39
		}
	},
	Analog: {
		default: {
			io: Analog,
			pin: 18
		}
	},
	io: { Analog, Digital, DigitalBank, I2C, PWM, Serial, SMBus, SPI },
	pin: {
		button: 11,
		buttonA: 11,
		buttonB: 12,
		backlight: 38,
		displayReset: 21,
		infraredTX: 46,
		infraredRX: 42,
		audioMCLK: 18,
		audioBCLK: 17,
		audioWS: 15,
		audioDataOut: 14,
		audioDataIn: 16
	}
};

export default device;
