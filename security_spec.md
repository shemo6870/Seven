# Security Specification for Seven Store

## Data Invariants
1. A user profile must belong to the authenticated user (`userId == auth.uid`).
2. Users can be either `buyer` or `seller`.
3. Sellers can create and manage their own products and categories.
4. Buyers can only manage their own profile and address.
5. All products must have a valid `sellerId` matching the creator.
6. Addresses in user profiles must follow the schema: `city`, `area`, `street`, `building` (required), plus `apartment` (optional).

## The "Dirty Dozen" Payloads (Deny Cases)
1. **Identity Spoofing**: Buyer attempts to change their role to 'seller'.
2. **Identity Spoofing**: User A attempts to update User B's profile.
3. **Identity Spoofing**: User creates a product with `sellerId` = "someone_else".
4. **State Shortcutting**: User attempts to update a product they don't own.
5. **Resource Poisoning**: User attempts to inject a 2MB string into a product name.
6. **Resource Poisoning**: User attempts to create a product with a negative price.
7. **Bypassing Address Schema**: User attempts to save address without required `city` or `area`.
8. **PII Leak**: User A attempts to read User B's private address.
9. **Role Escalation**: User attempts to create a profile as 'seller' without admin verification (Though in this app, the first seller is bootstrapped).
10. **Shadow Fields**: User updates profile with hidden `isVerified: true` field.
11. **Timestamp Spoofing**: User provides a manual `createdAt` string instead of `serverTimestamp()`.
12. **Orphaned Products**: User deletes a category that still has products (Not strictly enforceable in rules without triggers, but we can prevent unauthorized category deletion).

## Test Suite Plan
- Verify `isOwner()` correctly restricts user doc access.
- Verify `isValidProduct()` rejects malformed product data.
- Verify `affectedKeys().hasOnly()` blocks unauthorized field updates.
- Verify `address` validation.
