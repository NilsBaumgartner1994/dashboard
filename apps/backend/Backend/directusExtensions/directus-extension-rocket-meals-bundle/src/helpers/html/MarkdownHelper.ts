import MarkdownIt from 'markdown-it';

export class MarkdownHelper {
  public static getMarkdownNewLine(): string {
    return `\n\n`;
  }

  public static renderMarkdownTextToHtml(markdownText: string): string {
    const md = new MarkdownIt({ html: true });
    let html = md.render(markdownText);

    // <img ...> → <img style="max-width:100%;" ...>
    html = html.replace(/<img(.*?)>/g, '<img$1 style="max-width:100%; height:auto;">');

    return html;
  }

  public static EXAMPLE_MARKDOWN = `
# Title Level 1
## Title Level 2
### Title Level 3
#### Title Level 4
##### Title Level 5
###### Title Level 6

This is a paragraph with some text.

This is with **bold** and *italic* text.

This is a link [Google](https://www.google.com)

This is a list:
- Item 1
- Item 2
- Item 3

This is a numbered list:
1. Item 1
2. Item 2
3. Item 3

This is a table:
| Header 1 | Header 2 | Header 3 |
|----------|----------|----------|
| Cell 1   | Cell 2   | Cell 3   |
| Cell 4   | Cell 5   | Cell 6   |
| Cell 7   | Cell 8   | Cell 9   |

This is a code block:
\`\`\`javascript
console.log("Hello World!");
\`\`\`

This is an image:
![Image](https://picsum.photos/200/300)

This is a blockquote:
> This is a blockquote


This is a horizontal rule:
---
`;
}
