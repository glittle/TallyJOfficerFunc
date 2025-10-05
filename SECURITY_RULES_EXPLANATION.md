# Firebase Realtime Database Security Rules

## Overview
These security rules protect your TallyJ Officers database by ensuring users can only access data for elections they are participating in.

## Authentication Model
- Users authenticate anonymously via Firebase Auth
- Each user has a record at `/users/{uid}` containing:
  - `electionKey`: The election they are currently participating in
  - `memberId`: Their member/viewer ID in that election
  - `status`: online/offline status
  - `lang`: preferred language

## Security Rules Breakdown

### 1. Default Deny
```json
".read": false,
".write": false
```
By default, all access is denied. Access is only granted through specific rules below.

### 2. User Data (`/users/{uid}`)
```json
".read": "$uid === auth.uid",
".write": "$uid === auth.uid"
```
- Users can only read/write their own user record
- This allows users to update their status, language, and election association

### 3. User Elections History (`/userElections/{uid}`)
```json
".read": "$uid === auth.uid",
".write": "$uid === auth.uid"
```
- Users can only access their own election history
- Stores list of elections the user has participated in

### 4. Election Data (`/elections/{electionKey}`)
```json
".read": "auth != null && root.child('users').child(auth.uid).child('electionKey').val() === $electionKey",
".write": "auth != null && root.child('users').child(auth.uid).child('electionKey').val() === $electionKey"
```
- Users must be authenticated
- Users can only access elections where their `/users/{uid}/electionKey` matches the election
- This prevents users from accessing other elections

### 5. Members, Viewers, Positions, Voting, VotingRounds
Same rule as elections - users can only access data for their current election.

### 6. Voter Symbols (`/voterSymbols/{electionKey}/{memberId}`)
```json
".read": "auth != null && 
         root.child('users').child(auth.uid).child('electionKey').val() === $electionKey && 
         root.child('users').child(auth.uid).child('memberId').val() === $memberId",
".write": false
```
- **Most restrictive rule** - users can only see their own voting symbol
- Prevents users from seeing other members' symbols (maintains voting anonymity)
- Write is disabled for users (only Cloud Functions can write)

## How It Works

### Joining an Election
1. User signs in anonymously
2. User navigates to election URL (e.g., `?electionKey123`)
3. App updates `/users/{uid}/electionKey` to `electionKey123`
4. User can now read/write data under `/elections/electionKey123`, `/members/electionKey123`, etc.

### Switching Elections
1. User updates their `/users/{uid}/electionKey` to a new election
2. Access to old election data is automatically revoked
3. Access to new election data is granted

### Cloud Functions
Cloud Functions run with admin privileges and bypass these rules, allowing them to:
- Assign voter symbols
- Process voting results
- Delete elections
- Update member status when users disconnect

## Testing Rules

### Valid Access
```javascript
// User abc123 with electionKey = "election1"
db.ref('/elections/election1').once('value')  // ✅ Allowed
db.ref('/members/election1').once('value')    // ✅ Allowed
db.ref('/users/abc123').once('value')         // ✅ Allowed
```

### Invalid Access
```javascript
// User abc123 with electionKey = "election1"
db.ref('/elections/election2').once('value')  // ❌ Denied
db.ref('/users/xyz789').once('value')         // ❌ Denied
db.ref('/voterSymbols/election1/member2')     // ❌ Denied (not their symbol)
```

## Deployment
To deploy these rules:
```bash
firebase deploy --only database
```

## Important Notes
1. **Cloud Functions bypass these rules** - They have admin access
2. **Users must update their electionKey** before accessing election data
3. **Voter symbols are private** - Only the assigned member can see their symbol
4. **No public read/write** - All access requires authentication and proper electionKey

## Migration from Open Rules
If you're migrating from open rules (`".read": true, ".write": true`):
1. Ensure all users are properly authenticated
2. Verify `/users/{uid}/electionKey` is set for all active users
3. Test in emulator first: `firebase emulators:start`
4. Deploy during low-traffic period
5. Monitor logs for access denied errors