# Meter Billing API Tests

This document contains examples and tests for the Meter Billing API endpoints.

## 1. Configure Prepaid Billing

### Endpoint

```
POST /api/meter/config/prepaid
```

### Authentication

Requires authentication token in Authorization header.

### Request Body

```json
{
  "DRN": "2301420001",
  "credit_option": "Fixed Amount",
  "notification_types": ["SMS", "Email"],
  "notification_frequency": "Weekly",
  "automatic_credit_updates": true
}
```

### Response (New Configuration)

**Status:** 201 Created

```json
{
  "message": "Prepaid billing configuration created successfully"
}
```

### Response (Update Existing Configuration)

**Status:** 200 OK

```json
{
  "message": "Prepaid billing configuration updated successfully"
}
```

## 2. Get Billing Configuration for a Meter

### Endpoint

```
GET /api/meter/config/:DRN
```

### Authentication

Requires authentication token in Authorization header.

### URL Parameters

- `DRN`: The Device Reference Number of the meter

### Response

**Status:** 200 OK

```json
{
  "id": 1,
  "DRN": "2301420001",
  "billing_mode": "Prepaid",
  "turn_off_max_amount": 0,
  "turn_on_max_amount": 0,
  "amount_notifications": 0,
  "billing_period": "1st",
  "custom_billing_day": null,
  "billing_credit_days": "30 Days",
  "credit_option": "Fixed Amount",
  "notification_frequency": "Weekly",
  "automatic_credit_updates": 1,
  "notification_types": ["SMS", "Email"],
  "created_at": "2023-11-15T10:30:00.000Z",
  "updated_at": "2023-11-15T10:30:00.000Z"
  
}
```

### Response (Meter Not Found)

**Status:** 404 Not Found

```json
{
  "message": "No billing configuration found for this meter"
}
```

### Example cURL

```bash
curl -X GET http://localhost:3000/api/meter/config/2301420001 \
  -H "Authorization: Bearer <your_auth_token>"
```

## 3. Configure Postpaid Billing

### Endpoint

```
POST /api/meter/config/postpaid
```

### Authentication

Requires authentication token in Authorization header.

### Request Body

```json
{
  "DRN": "2301420001",
  "turn_off_max_amount": true,
  "turn_on_max_amount": true,
  "amount_notifications": true,
  "billing_period": "1st",
  "billing_credit_days": "30 Days",
  "notification_types": ["SMS", "Email"]
}
```

### Alternative Request (with custom billing day)

```json
{
  "DRN": "2301420002",
  "turn_off_max_amount": false,
  "turn_on_max_amount": true,
  "amount_notifications": true,
  "billing_period": "Custom",
  "custom_billing_day": 20,
  "billing_credit_days": "14 Days",
  "notification_types": ["Email"]
}
```

### Response (New Configuration)

**Status:** 201 Created

```json
{
  "message": "Postpaid billing configuration created successfully"
}
```

### Response (Update Existing Configuration)

**Status:** 200 OK

```json
{
  "message": "Postpaid billing configuration updated successfully"
}
```

### Example cURL

```bash
curl -X POST http://localhost:4000/api/meter/config/postpaid \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your_auth_token>" \
  -d '{
    "DRN": "2301420001",
    "turn_off_max_amount": true,
    "turn_on_max_amount": true,
    "amount_notifications": true,
    "billing_period": "1st",
    "billing_credit_days": "30 Days",
    "notification_types": ["SMS", "Email"]
  }'
```

## 4. Custom Billing Date Test

This test verifies that a postpaid meter can be configured with a custom billing date.

### Request (Custom Billing Date)

```
POST /api/meter/config/postpaid
```

### Request Body

```json
{
  "DRN": "2301420003",
  "turn_off_max_amount": true,
  "turn_on_max_amount": true,
  "amount_notifications": true,
  "billing_period": "Custom",
  "custom_billing_day": 25,
  "billing_credit_days": "14 Days",
  "notification_types": ["SMS"]
}
```

### Response (Success)

**Status:** 201 Created

```json
{
  "message": "Postpaid billing configuration created successfully"
}
```

### Verification Steps

1. Send the request to create a meter with custom billing date
2. Verify the successful response (201 Created)
3. Make a GET request to `/api/meter/config/2301420003` to verify the saved configuration
4. Check that `billing_period` equals "Custom" and `custom_billing_day` equals 25

### Example cURL

```bash
# Step 1: Create configuration with custom billing date
curl -X POST http://localhost:4000/api/meter/config/postpaid \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your_auth_token>" \
  -d '{
    "DRN": "2301420003",
    "turn_off_max_amount": true,
    "turn_on_max_amount": true,
    "amount_notifications": true,
    "billing_period": "Custom",
    "custom_billing_day": 25,
    "billing_credit_days": "14 Days",
    "notification_types": ["SMS"]
  }'

# Step 2: Verify the configuration
curl -X GET http://localhost:4000/api/meter/config/2301420003 \
  -H "Authorization: Bearer <your_auth_token>"
```

### Expected GET Response

```json
{
  "id": 3,
  "DRN": "2301420003",
  "billing_mode": "Postpaid",
  "turn_off_max_amount": 1,
  "turn_on_max_amount": 1,
  "amount_notifications": 1,
  "billing_period": "Custom",
  "custom_billing_day": 25,
  "billing_credit_days": "14 Days",
  "credit_option": null,
  "notification_frequency": null,
  "automatic_credit_updates": 0,
  "notification_types": ["SMS"],
  "created_at": "2023-11-15T14:30:00.000Z",
  "updated_at": "2023-11-15T14:30:00.000Z"
}
```

### Error Case: Invalid Custom Day

**Request Body**
```json
{
  "DRN": "2301420003",
  "billing_period": "Custom",
  "custom_billing_day": 32,
  "billing_credit_days": "14 Days"
}
```

**Response**
```json
{
  "error": "Custom billing day must be between 1 and 31"
}
```

## 5. Email Notification Testing

### Test Notification for a Specific Meter

This test allows sending a test email notification to a user with a specific meter.

### Endpoint

```
POST /api/billing/test-notification
```

### Authentication

Requires authentication token in Authorization header.

### Request Body

```json
{
  "DRN": "0260060136363",
  "emailOverride": "test@example.com"  // Optional - override the user's email address
}
```

### Response (Success)

**Status:** 200 OK

```json
{
  "message": "Test email sent successfully",
  "details": {
    "messageId": "<202311160948.84984758@gridx.com>",
    "to": "test@example.com",
    "consumption": "12.45",
    "billingMode": "Postpaid",
    "billingDay": "22"
  }
}
```

### Example cURL

```bash
curl -X POST http://localhost:4000/api/billing/test-notification \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your_auth_token>" \
  -d '{
    "DRN": "0260060136363"
  }'
```

### Errors

**Meter Not Found (404)**
```json
{
  "error": "Meter configuration or user not found"
}
```

**Invalid Request (400)**
```json
{
  "error": "DRN is required"
}
```

**No Email Available (400)**
```json
{
  "error": "No email address available for this meter user"
}
```

## 6. Trigger All Email Notifications

This endpoint manually triggers the email notification process for all eligible meters.

### Endpoint

```
POST /api/billing/trigger-all
```

### Authentication

Requires authentication token in Authorization header.

### Request Body

No request body needed.

### Response (Success)

**Status:** 200 OK

```json
{
  "message": "Email notifications processed successfully"
}
```

### Example cURL

```bash
curl -X POST http://localhost:4000/api/billing/trigger-all \
  -H "Authorization: Bearer <your_auth_token>"
```

### Email Content Examples

#### Prepaid Meter Email

![Prepaid Email](https://via.placeholder.com/600x400?text=Prepaid+Email+Template)

The prepaid meter email includes:
- Customer name and meter DRN
- Current date
- Energy consumed for the day in kWh
- Reminder to manage prepaid balance

#### Postpaid Meter Email

![Postpaid Email](https://via.placeholder.com/600x400?text=Postpaid+Email+Template)

The postpaid meter email includes:
- Customer name and meter DRN
- Current date
- Billing date (1st, 15th, end of month, or custom date)
- Energy consumption in kWh
- Payment reminder

## 7. Configure Meter Tier

### Endpoint

```
POST /api/meter/config/tier
```

### Authentication

Requires authentication token in Authorization header.

### Request Body

```json
{
  "DRN": "2301420001",
  "tier": "Tier 2"
}
```

### Valid Tier Values

- `"Tier 1"` - Basic functionality Meter
- `"Tier 2"` - Medium functionality Meter
- `"Tier 3"` - Premium functionality Meter

### Response (New Configuration)

**Status:** 201 Created

```json
{
  "message": "Meter tier configuration created successfully"
}
```

### Response (Update Existing Configuration)

**Status:** 200 OK

```json
{
  "message": "Meter tier configuration updated successfully"
}
```

### Example cURL

```bash
curl -X POST http://localhost:4000/api/meter/config/tier \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your_auth_token>" \
  -d '{
    "DRN": "2301420001",
    "tier": "Tier 2"
  }'
```

### Error Responses

**Invalid Tier Value (400 Bad Request)**
```json
{
  "error": "Invalid tier. Must be \"Tier 1\", \"Tier 2\", or \"Tier 3\""
}
```

**Missing DRN (400 Bad Request)**
```json
{
  "error": "DRN is required"
}
```

**Server Error (500 Internal Server Error)**
```json
{
  "error": "Failed to configure meter tier",
  "details": "Error message details"
}
```

## 8. Testing Meter Tier Functionality

### Test Case 1: Setting Tier for a New Meter

This test verifies that you can set a tier for a meter that doesn't have any configuration yet.

1. Send a request to set tier for a meter that doesn't have any configuration:
```bash
curl -X POST http://localhost:4000/api/meter/config/tier \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your_auth_token>" \
  -d '{
    "DRN": "9876543210",
    "tier": "Tier 1"
  }'
```

2. Expect a 201 Created response with a success message
3. Verify the configuration was created by getting the meter configuration:
```bash
curl -X GET http://localhost:4000/api/meter/config/9876543210 \
  -H "Authorization: Bearer <your_auth_token>"
```

4. Verify that the meter_tier field is set to "Tier 1" in the response

### Test Case 2: Updating Tier for an Existing Meter

This test verifies that you can update the tier for a meter that already has a configuration.

1. First, create a prepaid configuration for a meter:
```bash
curl -X POST http://localhost:4000/api/meter/config/prepaid \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your_auth_token>" \
  -d '{
    "DRN": "1234567890",
    "credit_option": "Fixed Amount",
    "notification_types": ["SMS"],
    "notification_frequency": "Weekly",
    "automatic_credit_updates": false
  }'
```

2. Then, set a tier for the same meter:
```bash
curl -X POST http://localhost:4000/api/meter/config/tier \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your_auth_token>" \
  -d '{
    "DRN": "1234567890",
    "tier": "Tier 3"
  }'
```

3. Expect a 200 OK response with a success message
4. Verify the tier was updated by getting the meter configuration:
```bash
curl -X GET http://localhost:4000/api/meter/config/1234567890 \
  -H "Authorization: Bearer <your_auth_token>"
```

5. Verify that the meter_tier field is set to "Tier 3" in the response

### Test Case 3: Including Tier in Prepaid Configuration

This test verifies that you can include a tier when creating a prepaid configuration.

1. Send a request to create a prepaid configuration with tier information:
```bash
curl -X POST http://localhost:4000/api/meter/config/prepaid \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your_auth_token>" \
  -d '{
    "DRN": "1122334455",
    "credit_option": "Flexible Amount",
    "notification_types": ["Email"],
    "notification_frequency": "Monthly",
    "automatic_credit_updates": true,
    "meter_tier": "Tier 2"
  }'
```

2. Expect a 201 Created response with a success message
3. Verify the configuration was created with the correct tier by getting the meter configuration:
```bash
curl -X GET http://localhost:4000/api/meter/config/1122334455 \
  -H "Authorization: Bearer <your_auth_token>"
```

4. Verify that the meter_tier field is set to "Tier 2" in the response

### Test Case 4: Including Tier in Postpaid Configuration

This test verifies that you can include a tier when creating a postpaid configuration.

1. Send a request to create a postpaid configuration with tier information:
```bash
curl -X POST http://localhost:4000/api/meter/config/postpaid \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your_auth_token>" \
  -d '{
    "DRN": "5566778899",
    "turn_off_max_amount": true,
    "turn_on_max_amount": true,
    "amount_notifications": true,
    "billing_period": "1st",
    "billing_credit_days": "30 Days",
    "notification_types": ["SMS", "Email"],
    "meter_tier": "Tier 1"
  }'
```

2. Expect a 201 Created response with a success message
3. Verify the configuration was created with the correct tier by getting the meter configuration:
```bash
curl -X GET http://localhost:4000/api/meter/config/5566778899 \
  -H "Authorization: Bearer <your_auth_token>"
```

4. Verify that the meter_tier field is set to "Tier 1" in the response

### Test Case 5: Error Handling for Invalid Tier

This test verifies that the API properly handles invalid tier values.

1. Send a request with an invalid tier value:
```bash
curl -X POST http://localhost:4000/api/meter/config/tier \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your_auth_token>" \
  -d '{
    "DRN": "1234567890",
    "tier": "Invalid Tier"
  }'
```

2. Expect a 400 Bad Request response with an error message indicating the tier is invalid

## 9. Integration with Billing Workflows

The meter tier functionality integrates with the existing billing system to provide tiered service levels and features:

### Tier 1 (Basic functionality)
- Basic energy monitoring
- Standard billing functionality
- Email notifications on billing day

### Tier 2 (Medium functionality)
- All Tier 1 features
- Advanced energy usage analytics
- SMS notifications
- Custom billing schedules

### Tier 3 (Premium functionality)
- All Tier 2 features
- Real-time energy monitoring
- Priority customer support
- Enhanced prepaid options
- Advanced automation features

When testing the integration between tier settings and billing features, make sure to:

1. Verify tier information is properly stored with both prepaid and postpaid configurations
2. Ensure the tier information is retrieved correctly with billing configuration queries
3. Test that updating the tier does not affect other billing configuration parameters
4. Check that including tier information in prepaid/postpaid configuration works correctly
