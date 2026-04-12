/*
 * Copyright (c) 2016-2025  Moddable Tech, Inc.
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


#define __XS6PLATFORMMINIMAL__

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "sdkconfig.h"

#include "xs.h"
#include "xsHost.h"
#include "xsHosts.h"

#include "mc.defines.h"

#if MODDEF_ECMA419_ENABLED
	#include "common/builtinCommon.h"
#endif

#define WEAK __attribute__((weak))

#include "sdkconfig.h"
#include "tinyusb.h"
#include "tinyusb_cdc_acm.h"
#include "tinyusb_default_config.h"
#include "esp_system.h"

extern void fx_putc(void *refcon, char c);		//@@

#ifdef mxDebug
	extern xsMachine *gThe;		// this is copied in from main
#endif

typedef struct {
    uint8_t     *buf;
    uint32_t    size_mask;
    volatile uint32_t read;
    volatile uint32_t write;
} fifo_t;

QueueHandle_t usbDbgQueue;
static uint32_t usbEvtPending = 0;
static fifo_t rx_fifo;
static uint8_t *rx_fifo_buffer;
static uint8_t usb_rx_buf[CONFIG_TINYUSB_CDC_RX_BUFSIZE];
#define USB_TX_PENDING_SIZE 4096
static uint8_t usb_tx_pending[USB_TX_PENDING_SIZE];
static uint16_t usb_tx_pending_count = 0;

static void queue_pending_output(const uint8_t *bytes, int count) {
	if (count <= 0)
		return;

	if (count >= USB_TX_PENDING_SIZE) {
		c_memcpy(usb_tx_pending, bytes + count - USB_TX_PENDING_SIZE, USB_TX_PENDING_SIZE);
		usb_tx_pending_count = USB_TX_PENDING_SIZE;
		return;
	}

	if ((usb_tx_pending_count + count) > USB_TX_PENDING_SIZE) {
		uint16_t keep = USB_TX_PENDING_SIZE - count;
		c_memmove(usb_tx_pending, usb_tx_pending + usb_tx_pending_count - keep, keep);
		usb_tx_pending_count = keep;
	}

	c_memcpy(usb_tx_pending + usb_tx_pending_count, bytes, count);
	usb_tx_pending_count += count;
}

static uint8_t write_usb_bytes(const uint8_t *bytes, int count) {
	while (count > 0) {
		uint32_t amt = (count > CONFIG_TINYUSB_CDC_RX_BUFSIZE) ? CONFIG_TINYUSB_CDC_RX_BUFSIZE : count;
		tinyusb_cdcacm_write_queue(TINYUSB_CDC_ACM_0, bytes, amt);
		if (ESP_ERR_TIMEOUT == tinyusb_cdcacm_write_flush(TINYUSB_CDC_ACM_0, 50)) {
			queue_pending_output(bytes, count);
			return 0;
		}
		bytes += amt;
		count -= amt;
	}

	return 1;
}

static void flush_pending_output(void) {
	if (!usb_tx_pending_count)
		return;
	if (!tud_cdc_connected())
		return;

	uint16_t pendingCount = usb_tx_pending_count;
	usb_tx_pending_count = 0;
	if (!write_usb_bytes(usb_tx_pending, pendingCount))
		return;
}

static uint32_t F_length(fifo_t *fifo) {
	uint32_t tmp = fifo->read;
	return fifo->write - tmp;
}

static void F_put(fifo_t *fifo, uint8_t c) {
	fifo->buf[fifo->write & fifo->size_mask] = c;
	fifo->write++;
}

static void F_get(fifo_t *fifo, uint8_t *c) {
	*c = fifo->buf[fifo->read & fifo->size_mask];
	fifo->read++;
}

/*
void fifo_flush(fifo_t *fifo) {
	fifo->read = fifo->write;
}
*/

uint32_t fifo_length(fifo_t *fifo) {
	return F_length(fifo);
}

uint32_t fifo_remain(fifo_t *fifo) {
	return (fifo->size_mask + 1) - F_length(fifo);
}

int fifo_get(fifo_t *fifo, uint8_t *c) {
	if (F_length(fifo) == 0)
		return -1;
	F_get(fifo, c);
	return 0;
}

int fifo_put(fifo_t *fifo, uint8_t c) {
	if (0 == (fifo->size_mask - F_length(fifo) + 1))
{
// printf("fifo_put failed\r\n");
		return -1;
}
	F_put(fifo, c);
	return 0;
}

int fifo_init(fifo_t *fifo, uint8_t *buf, uint32_t size) {
	if (0 == buf)
		return -1;

	if (! ((0 != size) && (0 == ((size - 1) & size))))
{
// printf("fifo_init - bad size: %ld\r\n", size);
		return -2;		// bad size - needs to be base 2
}

	fifo->buf = buf;
	fifo->size_mask = size - 1;
	fifo->read = 0;
	fifo->write = 0;

	return 0;
}


#ifdef mxDebug

static void debug_task(void *pvParameter)
{
	while (true) {
		uint32_t count;
		if (!fifo_length(&rx_fifo)) {
			usbEvtPending = 0;
			xQueueReceive((QueueHandle_t)pvParameter, (void * )&count, portMAX_DELAY);
		}

		fxReceiveLoop();
	}
}
#endif

/*
	Required functions provided by application
	to enable serial port for diagnostic information and debugging
*/

WEAK void modLog_transmit(const char *msg)
{
	uint8_t c;

#ifdef mxDebug
	if (gThe) {
		while (0 != (c = c_read8(msg++)))
			fx_putc(gThe, c);
		fx_putc(gThe, 0);
	}
	else
#endif
	{
		while (0 != (c = c_read8(msg++)))
			ESP_putc(c);
		ESP_putc(13);
		ESP_putc(10);
	}
}

static uint8_t gLineStateDTR = 1;
static uint8_t gLineStateRTS = 1;
static uint8_t gLineStateSequence = 3;
static uint8_t gLineStateInitialized = 0;
static uint8_t gRestartArmed = 0;

static void checkLineState(uint8_t previousSequence, uint8_t sequence) {
	/*
		Use an explicit two-step debugger restart pattern so ordinary serial-port
		opens on Windows do not accidentally reboot the board:
			1) DTR on, RTS off  -> sequence 1
			2) DTR on, RTS on   -> sequence 3 (arm restart)
			3) DTR off, RTS on  -> sequence 2 (restart)
	*/
	if ((previousSequence == 1) && (sequence == 3)) {
		gRestartArmed = 1;
		return;
	}

	if (gRestartArmed && (previousSequence == 3) && (sequence == 2)) {
		gRestartArmed = 0;
		esp_restart();
		return;
	}

	if (sequence != 3)
		gRestartArmed = 0;
}

void line_state_callback(int itf, cdcacm_event_t *event) {
	uint8_t dtr = event->line_state_changed_data.dtr;
	uint8_t rts = event->line_state_changed_data.rts;
	uint8_t sequence = (dtr ? 1 : 0) + (rts ? 2 : 0);
	uint8_t previousSequence = gLineStateSequence;

	(void)itf;

	/*
		Windows usbser often reports an initial transient line state while opening
		the CDC device. Ignore the very first notification so host auto-open does
		not reset the board, but preserve later explicit DTR/RTS transitions so
		serial2xsbug can still request a restart.
	*/
	if (!gLineStateInitialized) {
		gLineStateInitialized = 1;
		gLineStateDTR = dtr;
		gLineStateRTS = rts;
		gLineStateSequence = sequence;
		gRestartArmed = 0;
		return;
	}

	if ((gLineStateDTR == dtr) && (gLineStateRTS == rts))
		return;

	gLineStateDTR = dtr;
	gLineStateRTS = rts;
	gLineStateSequence = sequence;
	checkLineState(previousSequence, sequence);

	if (tud_cdc_connected())
		flush_pending_output();
}

void cdc_rx_callback(int itf, cdcacm_event_t *event) {
    portBASE_TYPE xTaskWoken = 0;
	size_t space, read;
	int i;

	space = fifo_remain(&rx_fifo);
	esp_err_t ret = tinyusb_cdcacm_read(itf, usb_rx_buf, space, &read);
	if (ESP_OK == ret) {
		for (i=0; i<read; i++)
			fifo_put(&rx_fifo, usb_rx_buf[i]);
	}

	i = 0;

#if mxDebug
	if (0 == usbEvtPending++) {
		xQueueSendToBackFromISR(usbDbgQueue, &i, &xTaskWoken);
		if (xTaskWoken == pdTRUE)
			portYIELD_FROM_ISR();
	}
#endif
}

void ESP_put(uint8_t *c, int count) {
	if (!tud_cdc_connected()) {
		queue_pending_output(c, count);
		return;
	}

	flush_pending_output();
	write_usb_bytes(c, count);
}

void ESP_putc(int c) {
	uint8_t ch = c;
	ESP_put(&ch, 1);
}

int ESP_getc(void) {
	uint8_t c;

	if (0 == fifo_get(&rx_fifo, &c))
		return c;
	return -1;
}

uint8_t ESP_setBaud(int baud) {
	return 0;
}
void setupDebugger(void) {
	const tinyusb_config_t tusb_cfg = TINYUSB_DEFAULT_CONFIG();
	ESP_ERROR_CHECK(tinyusb_driver_install(&tusb_cfg));
	tinyusb_config_cdcacm_t acm_cfg = {
		.cdc_port = TINYUSB_CDC_ACM_0,
		.callback_rx = &cdc_rx_callback,
		.callback_rx_wanted_char = NULL,
		.callback_line_state_changed = &line_state_callback,
		.callback_line_coding_changed = NULL
	};

	rx_fifo_buffer = c_malloc(1024);
	fifo_init(&rx_fifo, rx_fifo_buffer, 1024);

#if mxDebug
	usbDbgQueue = xQueueCreate(8, sizeof(uint32_t));
	xTaskCreate(debug_task, "debug", 2048, usbDbgQueue, 8, NULL);
#endif

	ESP_ERROR_CHECK(tinyusb_cdcacm_init(&acm_cfg));

	uint32_t count;
	for (count = 0; count < 100; count++) {
		if (tud_cdc_connected()) {
			// printf("USB CONNECTED!\r\n");
			flush_pending_output();
			break;
		}
		modDelayMilliseconds(50);	// give USB time to come up
	}
}
