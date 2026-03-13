# Admin Password Reset API Documentation

This flow allows an admin to reset their password securely using email verification and a PIN.

## 1. Request Password Reset PIN

**Endpoint:**  
POST `/api/adminAuth/forgot-password`

**Body:**

**Description:**  
This endpoint sends a password reset PIN to the admin's registered email address.

**Response:**  
- `200 OK`: PIN sent successfully.
- `400 Bad Request`: Invalid email address.

## 2. Verify Password Reset PIN

**Endpoint:**  
POST `/api/adminAuth/verify-pin`

**Body:**
```json
{
  "email": "admin@example.com",
  "pin": "123456"
}
```

**Description:**  
This endpoint verifies the PIN sent to the admin's email.

**Response:**  
- `200 OK`: PIN verified successfully.
- `400 Bad Request`: Invalid PIN or email.

## 3. Reset Password

**Endpoint:**  
POST `/api/adminAuth/reset-password`

**Body:**
```json
{
  "email": "admin@example.com",
  "newPassword": "newSecurePassword123",
  "pin": "123456"
}
```

**Description:**  
This endpoint allows the admin to reset their password using the verified PIN.

**Response:**  
- `200 OK`: Password reset successfully.
- `400 Bad Request`: Invalid PIN or email.
- `500 Internal Server Error`: Server error occurred.
