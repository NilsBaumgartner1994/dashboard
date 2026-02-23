import { defineEndpoint } from '@directus/extensions-sdk';
import { DatabaseInitializedCheck } from '../helpers/DatabaseInitializedCheck';

// TO Test this Endpoint:
// 1. Login with a user in the Directus Admin UI
// 2. Go to the URL: http://127.0.0.1/<DOMAIN_PATH>/api/cors-proxy?url=<encoded_url>
// Where http://127.0.0.1/<DOMAIN_PATH>/api is the URL of the Directus API
// The URL parameter should be URL-encoded

const SCHEDULE_NAME = 'cors-proxy-endpoint';

export default defineEndpoint({
  id: 'cors-proxy',
  handler: (router, apiContext) => {
    router.get('/', async (req, res) => {
      try {
        let allTablesExist = await DatabaseInitializedCheck.checkAllTablesExistWithApiContext(
          SCHEDULE_NAME,
          apiContext
        );
        if (!allTablesExist) {
          return res.status(500).json({
            error: 'Database not fully initialized',
          });
        }

        // Get the URL to fetch from query parameters
        const { url } = req.query;

        if (!url || typeof url !== 'string') {
          return res.status(400).json({
            error: 'Missing or invalid URL parameter. Usage: ?url=<encoded_url>',
          });
        }

        // Decode the URL
        let decodedUrl: string;
        try {
          decodedUrl = decodeURIComponent(url);
        } catch (error) {
          return res.status(400).json({
            error: 'Invalid URL encoding',
          });
        }

        // Validate that the URL is properly formatted
        try {
          new URL(decodedUrl);
        } catch (error) {
          return res.status(400).json({
            error: 'Invalid URL format',
          });
        }

        // Fetch the URL using undici (included in directus)
        const response = await fetch(decodedUrl);

        // Check if the response is successful
        if (!response.ok) {
          return res.status(response.status).json({
            error: `Remote server returned status ${response.status}`,
          });
        }

        // Get content type from the remote response
        const contentType = response.headers.get('content-type');

        // Read the response body
        const body = await response.text();

        // Set response headers
        res.set('Content-Type', contentType || 'application/json');
        res.set('Access-Control-Allow-Origin', '*');

        // Return the fetched content
        return res.send(body);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return res.status(500).json({
          error: 'Failed to fetch the URL',
          details: errorMessage,
        });
      }
    });

    router.post('/', async (req, res) => {
      try {
        let allTablesExist = await DatabaseInitializedCheck.checkAllTablesExistWithApiContext(
          SCHEDULE_NAME,
          apiContext
        );
        if (!allTablesExist) {
          return res.status(500).json({
            error: 'Database not fully initialized',
          });
        }

        // Get the URL to fetch from request body
        const { url, method = 'GET', headers = {}, body: requestBody } = req.body;

        if (!url || typeof url !== 'string') {
          return res.status(400).json({
            error: 'Missing or invalid URL in request body',
          });
        }

        // Validate that the URL is properly formatted
        try {
          new URL(url);
        } catch (error) {
          return res.status(400).json({
            error: 'Invalid URL format',
          });
        }

        // Build fetch options
        const fetchOptions: RequestInit = {
          method: method.toUpperCase(),
          headers: {
            ...headers,
          },
        };

        // Add body if present and not a GET request
        if (requestBody && method.toUpperCase() !== 'GET') {
          fetchOptions.body =
            typeof requestBody === 'string' ? requestBody : JSON.stringify(requestBody);
        }

        // Fetch the URL
        const response = await fetch(url, fetchOptions);

        // Check if the response is successful
        if (!response.ok) {
          return res.status(response.status).json({
            error: `Remote server returned status ${response.status}`,
          });
        }

        // Get content type from the remote response
        const contentType = response.headers.get('content-type');

        // Read the response body
        const body = await response.text();

        // Set response headers
        res.set('Content-Type', contentType || 'application/json');
        res.set('Access-Control-Allow-Origin', '*');

        // Return the fetched content
        return res.send(body);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return res.status(500).json({
          error: 'Failed to fetch the URL',
          details: errorMessage,
        });
      }
    });
  },
});

