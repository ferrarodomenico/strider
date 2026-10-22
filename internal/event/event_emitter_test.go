package event

import (
	"sync"
	"testing"
	"time"
)

func isClosed(ch chan struct{}) bool {
	select {
	case <-ch:
		return true
	default:
		return false
	}
}

func TestNewEventEmitter_CurrentIsOpen(t *testing.T) {
	e := NewEventEmitter()

	ch := e.Current()
	if ch == nil {
		t.Fatal("Current() returned nil channel")
	}
	if isClosed(ch) {
		t.Fatal("new emitter's channel should not be closed")
	}
}

func TestCurrent_ReturnsSameChannelWithoutEmit(t *testing.T) {
	e := NewEventEmitter()

	first, second := e.Current(), e.Current()
	if first != second {
		t.Fatal("Current() should return the same channel until Emit is called")
	}
}

func TestEmit_ClosesPreviousChannel(t *testing.T) {
	e := NewEventEmitter()
	before := e.Current()

	e.Emit()

	if !isClosed(before) {
		t.Fatal("Emit() should close the previously current channel")
	}
}

func TestEmit_ReplacesWithFreshOpenChannel(t *testing.T) {
	e := NewEventEmitter()
	before := e.Current()

	e.Emit()
	after := e.Current()

	if after == before {
		t.Fatal("Emit() should replace the current channel")
	}
	if isClosed(after) {
		t.Fatal("channel after Emit() should be open")
	}
}

func TestEmit_MultipleTimesDoesNotPanic(t *testing.T) {
	e := NewEventEmitter()

	for range 3 {
		e.Emit()
	}

	if isClosed(e.Current()) {
		t.Fatal("current channel should be open after repeated Emit()")
	}
}

func TestEmit_WakesAllWaiters(t *testing.T) {
	e := NewEventEmitter()
	ch := e.Current()

	const waiters = 5
	var wg sync.WaitGroup
	wg.Add(waiters)
	for range waiters {
		go func() {
			defer wg.Done()
			<-ch
		}()
	}

	e.Emit()

	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("not all waiters were woken by Emit()")
	}
}

func TestEmit_ConcurrentCallsAreSafe(t *testing.T) {
	e := NewEventEmitter()

	var wg sync.WaitGroup
	for range 50 {
		wg.Add(2)
		go func() {
			defer wg.Done()
			e.Emit()
		}()
		go func() {
			defer wg.Done()
			_ = e.Current()
		}()
	}
	wg.Wait()
}
