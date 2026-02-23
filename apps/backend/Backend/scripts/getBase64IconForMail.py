# Due to privacy policy reasons we do not want to import the font from google fonts directly in our mail/html template.
# Therefore we convert the font to a base64 string and include it directly in the html template.

import os
import json
import base64
import argparse
from PIL import Image, ImageDraw, ImageFont
from io import BytesIO

# Delimiter to parse icon family and icon name
IconParseDelimiter = ':'

# Function to dynamically load available icon families based on glyphmap filenames
def load_available_icon_families(glyphmaps_path, fonts_path):
    available_families = {}
    for file_name in os.listdir(glyphmaps_path):
        if file_name.endswith('.json'):
            family_name = file_name.replace('.json', '')
            glyph_map_path = os.path.join(glyphmaps_path, file_name)
            font_path = os.path.join(fonts_path, f'{family_name}.ttf')
            if os.path.exists(font_path):
                available_families[family_name] = {
                    'glyph_map': glyph_map_path,
                    'font': font_path
                }
    return available_families

# Function to find node_modules directory and ensure npm install is done
def find_node_modules_directory(max_levels_up=10):
    current_dir = os.getcwd()
    for level in range(max_levels_up):
        if os.path.isdir(os.path.join(current_dir, "backend")) and os.path.isdir(os.path.join(current_dir, "frontend")):
            possible_path = os.path.join(current_dir, "frontend/app/node_modules")
            if os.path.isdir(possible_path):
                return possible_path
            else:
                print("Error: node_modules directory not found. Please run 'npm install' in the frontend app directory.")
                return None
        current_dir = os.path.dirname(current_dir)
    return None

# Function to load the glyph map from the JSON file
def load_glyph_map(glyph_map_path):
    with open(glyph_map_path, "r") as file:
        glyph_map = json.load(file)
    return glyph_map

# Function to encode the icon as a Base64 string
def encode_icon_to_base64(icon_name, glyph_map, font_path, size=64):
    if icon_name not in glyph_map:
        raise ValueError(f"Icon '{icon_name}' not found in the glyph map.")

    unicode_code = chr(glyph_map[icon_name])
    font = ImageFont.truetype(font_path, size)
    image = Image.new("RGBA", (size, size), (255, 255, 255, 0))
    draw = ImageDraw.Draw(image)

    text_bbox = draw.textbbox((0, 0), unicode_code, font=font)
    text_width, text_height = text_bbox[2] - text_bbox[0], text_bbox[3] - text_bbox[1]
    text_position = ((size - text_width) // 2, (size - text_height) // 2)
    draw.text(text_position, unicode_code, font=font, fill=(0, 0, 0, 255))

    buffered = BytesIO()
    image.save(buffered, format="PNG")
    base64_data = base64.b64encode(buffered.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{base64_data}"

# Function to wrap the base64 icon in a div and return the HTML
def wrap_base64_icon_in_div(base64_icon, icon_name, size):
    html = f'''
    <div style="display: flex; align-items: center;">
        <img src="{base64_icon}" alt="{icon_name}" style="width:{size}px; height:{size}px; margin-right:8px;">
    </div>
    '''
    return html

# Main function to generate the icon
def main(icon_input, node_modules_path, size, output_format):
    glyphmaps_path = os.path.join(node_modules_path, '@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps')
    fonts_path = os.path.join(node_modules_path, '@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts')

    # Load available icon families dynamically
    available_families = load_available_icon_families(glyphmaps_path, fonts_path)

    # Default icon family
    default_icon_family = "MaterialCommunityIcons"

    # Parse the input to get the icon family and icon name
    if IconParseDelimiter in icon_input:
        icon_family, icon_name = icon_input.split(IconParseDelimiter, 1)
    else:
        icon_family = default_icon_family  # Default family
        icon_name = icon_input

    if icon_family not in available_families:
        print(f"Error: Icon family '{icon_family}' not found.")
        print("Available icon families are:")
        for family in available_families.keys():
            print(f" - {family}")
        return

    glyph_map_path = available_families[icon_family]['glyph_map']
    font_path = available_families[icon_family]['font']

    # Load the glyph map
    glyph_map = load_glyph_map(glyph_map_path)

    # Generate the output
    if output_format == "base64":
        base64_icon = encode_icon_to_base64(icon_name, glyph_map, font_path, size)
        wrapped_html = wrap_base64_icon_in_div(base64_icon, icon_name, size)
        print(f"HTML for '{icon_input}':\n")
        print(wrapped_html)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate Base64 icon from various icon families.")
    parser.add_argument("icon_input", help="The icon input in the format 'IconFamily:iconName'. Default family is MaterialCommunityIcons.")
    parser.add_argument("--node_modules", help="Path to the node_modules directory.", default=None)
    parser.add_argument("--size", help="Size of the icon (used for both font size and image size).", type=int, default=24)
    parser.add_argument("--output_format", help="Output format: 'base64' for Base64 image.", choices=["base64"], default="base64")

    args = parser.parse_args()

    node_modules_path = args.node_modules
    if not node_modules_path:
        node_modules_path = find_node_modules_directory()

    if not node_modules_path or not os.path.isdir(node_modules_path):
        print("Error: node_modules directory not found. Please specify it with --node_modules <path>.")
        sys.exit(1)

    main(args.icon_input, node_modules_path, args.size, args.output_format)
