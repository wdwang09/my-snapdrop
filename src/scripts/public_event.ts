export class PublicEvent {
  static fire(type: string, message: Object) {
    // https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/dispatchEvent
    window.dispatchEvent(new CustomEvent(type, { detail: message }));
  }

  static on(type: string, callback: EventListenerOrEventListenerObject) {
    return window.addEventListener(type, callback, false);
  }
}
