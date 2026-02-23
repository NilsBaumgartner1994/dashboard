enum EmojiPixelSize {
  SMALL = 32,
  MEDIUM = 72,
  LARGE = 128,
  EXTRA_LARGE = 512,
}

enum DivTextSize {
  SMALL = 1,
  MEDIUM = 1.5,
  LARGE = 2,
  EXTRA_LARGE = 3.5,
}

// https://emojipedia.org/speech-balloon#technical use to search for the technical name of the emoji
enum EmojiFileNames {
  RED_CIRCLE = 'emoji_u1f534', // https://raw.githubusercontent.com/rocket-meals/noto-emoji/refs/heads/main/png/32/emoji_u1f534.png
  YELLOW_CIRCLE = 'emoji_u1f7e1',
  GREEN_CIRCLE = 'emoji_u1f7e2',
  THUMBS_UP = 'emoji_u1f44d',
  THUMBS_DOWN = 'emoji_u1f44e',
  SPEECH_BUBBLE = 'emoji_u1f4ac',
  STAR = 'emoji_u2b50',
}

export class EmojiHelper {
  public static DivTextSize = DivTextSize;
  public static EmojiPixelSize = EmojiPixelSize;
  public static EmojiFileNames = EmojiFileNames;

  private static getEmojiImageURL(filename: EmojiFileNames, size: EmojiPixelSize): string {
    return 'https://raw.githubusercontent.com/rocket-meals/noto-emoji/refs/heads/main/png/' + size + '/' + filename + '.png';
  }

  private static getEmojiDivTextSize(size: DivTextSize): string {
    // Map the size to approximate `em` units for text-based scaling
    let emojiSizeEm: number;

    switch (size) {
      case DivTextSize.SMALL:
        emojiSizeEm = 1;
        break;
      case DivTextSize.MEDIUM:
        emojiSizeEm = 1.5;
        break;
      case DivTextSize.LARGE:
        emojiSizeEm = 2;
        break;
      case DivTextSize.EXTRA_LARGE:
        emojiSizeEm = 3.5;
        break;
      default:
        emojiSizeEm = 1;
    }

    return `
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: ${emojiSizeEm}em;
            height: ${emojiSizeEm}em;
            vertical-align: middle;
            background-size: contain;
            background-repeat: no-repeat;
            background-position: center;
            background-color: transparent;
        `;
  }

  // Generate the full `div` with inline style for embedding
  public static getEmojiDivHTML(filename: EmojiFileNames, textSize?: DivTextSize, emojiImageSize?: EmojiPixelSize): string {
    emojiImageSize = emojiImageSize || EmojiPixelSize.SMALL;
    textSize = textSize || DivTextSize.SMALL;
    const imageUrl = EmojiHelper.getEmojiImageURL(filename, emojiImageSize);
    const style = EmojiHelper.getEmojiDivTextSize(textSize);

    return `<div style="${style} background-image: url('${imageUrl}');"></div>`;
  }
}
