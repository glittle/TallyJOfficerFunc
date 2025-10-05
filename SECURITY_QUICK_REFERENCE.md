# Security Rules Quick Reference

## Rule Summary

| Path | Who Can Read | Who Can Write |
|------|--------------|---------------|
| `/users/{uid}` | Only that user | Only that user |
| `/userElections/{uid}` | Only that user | Only that user |
| `/elections/{key}` | Users in that election | Users in that election |
| `/members/{key}` | Users in that election | Users in that election |
| `/viewers/{key}` | Users in that election | Users in that election |
| `/positions/{key}` | Users in that election | Users in that election |
| `/voting/{key}` | Users in that election | Users in that election |
| `/votingRounds/{key}` | Users in that election | Users in that election |
| `/voterSymbols/{key}/{id}` | Only that member | Cloud Functions only |

## Key Concepts

### ✅ Allowed
- User reads their own `/users/{uid}` data
- User reads election data where their `electionKey` matches
- User reads their own voter symbol
- Cloud Functions do anything (admin access)

### ❌ Denied
- User reads another user's data
- User reads election they're not part of
- User reads another member's voter symbol
- Unauthenticated access to anything

## Testing Checklist

Before deploying, verify:
- [ ] Users can join elections
- [ ] Users can see election data
- [ ] Users can vote
- [ ] Users can see their symbol
- [ ] Users CANNOT see other elections
- [ ] Users CANNOT see other symbols
- [ ] Cloud Functions still work

## Deploy Command
```bash
firebase deploy --only database
```

## Rollback Command
If something goes wrong:
```bash
# Restore old rules (INSECURE - temporary only!)
firebase deploy --only database
```

Then edit `database.rules.json` back to:
```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

## Monitor After Deployment
```bash
firebase functions:log
```

Look for:
- ❌ "permission denied" errors → electionKey not set correctly
- ✅ Normal operation → rules working correctly