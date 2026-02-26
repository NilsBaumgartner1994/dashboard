declare module 'speech-to-text' {
  export default class SpeechToText {
    constructor(
      onFinalised: (text: string) => void,
      onEndEvent: () => void,
      onAnythingSaid?: (text: string) => void,
      language?: string,
    )

    startListening(): void
    stopListening(): void
  }
}
