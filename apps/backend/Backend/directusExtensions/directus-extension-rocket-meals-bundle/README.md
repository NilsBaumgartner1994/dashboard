## IMOPRTANT!

https://github.com/rocket-meals/rocket-meals/issues/139

Currently when we want to apply a change we need to move the extension out of the directusExtensions
folder and then back in to the directusExtensions folder. Then start directus, remove the not found
extension, stop the server and then move the extension back in and start the server again.

# Rocket Meals Extension

https://docs.directus.io/extensions/bundles.html

## Add New Extensions To a Bundle

Create New

Navigate to your bundle extension directory in your terminal. Use the `npm run add` command and
select an extension type.

The new created extension will be added to the bundle's package.json file.

In your bundle's package.json file, the directus:extension object has an entries array that
describes all of the items contained within the bundle.

## Build the Bundle

https://docs.directus.io/extensions/creating-extensions.html

Navigate to your bundle extension directory in your terminal. Use the `npm run build` command to
build the bundle.
