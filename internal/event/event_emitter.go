package event

import (
	"sync"
	"time"
)

type EventEmitter struct {
	mux      sync.Mutex
	channel  chan struct{}
	throttle time.Duration
}

func NewEventEmitter() *EventEmitter {
	return &EventEmitter{
		channel: make(chan struct{}),
	}
}

func (e *EventEmitter) Emit() {
	e.mux.Lock()
	defer e.mux.Unlock()
	oldChannel := e.channel
	e.channel = make(chan struct{})
	close(oldChannel)
}

func (e *EventEmitter) Current() chan struct{} {
	e.mux.Lock()
	defer e.mux.Unlock()
	return e.channel
}
