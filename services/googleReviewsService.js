// Business Profile uses the same OAuth client/refresh token as YouTube.
// Consent for both scopes happens once at /auth — see services/googleAuth.js
import { oauth2Client, loadTokens } from "./googleAuth.js";

export const reviewsOauth2Client = oauth2Client;
export const loadReviewsTokens = loadTokens;
