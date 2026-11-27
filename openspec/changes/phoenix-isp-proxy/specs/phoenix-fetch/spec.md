## MODIFIED Requirements

### Requirement: Phoenix login uses the client's national id and WhatsApp number with an SMS code
The Phoenix login SHALL be performed with the client's national id (identity type ת.ז) and the client's WhatsApp number in local 05X form, and SHALL request the one-time code by SMS to that number. The provider's code channel SHALL be reported as SMS, so the agent tells the client to look for an SMS. When the site rejects the code and still shows the code screen, the platform SHALL treat it as a rejected code and let the client send a new one; when the personal area does not load within the wait, the login SHALL fail with the canned login-failed message.

The Phoenix login SHALL run through the outbound proxy configured for the `phoenix` provider (an Israeli ISP address, see `fetch-egress-proxy`), because the Phoenix login script is not served to the platform's own Azure address. When no proxy is configured for Phoenix, the session SHALL still be attempted directly, and its evidence SHALL show the direct route, so a login that fails because the login form never appeared can be read as an egress problem rather than a selector problem.

#### Scenario: Code is sent by SMS
- **WHEN** the worker starts a Phoenix login for a client who agreed
- **THEN** the site sends the code by SMS to the client's WhatsApp number and the client receives the canned "the code was just sent by SMS from הפניקס" message

#### Scenario: Wrong code can be retried
- **WHEN** the client forwards a wrong code and the site keeps the code screen up
- **THEN** the client receives the canned rejected-code message and may send another code within the session's wait

#### Scenario: Login form appears through the proxy
- **WHEN** `DOCUMENT_FETCH_PROXY_PHOENIX` points at a working Israeli ISP proxy and the worker starts a Phoenix login from production
- **THEN** the login page loads its form script, the ID field appears, the credentials are typed and the SMS code is requested, all through the proxy's single exit address

#### Scenario: No proxy configured in production
- **WHEN** `DOCUMENT_FETCH_PROXY_PHOENIX` is not set and the worker starts a Phoenix login from production
- **THEN** the login fails with the canned login-failed message as before, and the session's evidence summary shows the route as direct, with the login-failed step recording the 404 of the login script in its network log
