// back end processes for TallyJ Officer
// include a version number in logs to know when a new version of this code is in use
const version = 54;

console.log('version', version, 'registered');

const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();
// const firestore = admin.firestore();
const db = admin.database();


exports.onVotingChange = functions.database
    .ref('/voting/{electionKey}').onUpdate((change, context) => {
        const electionKey = context.params.electionKey;
        console.log('voting changed', electionKey);

        const newValue = change.after.val();
        const oldValue = change.before.val();

        // console.log('new', newValue, 'old', oldValue);

        if (JSON.stringify(newValue.votes) !== JSON.stringify(oldValue.votes)) {

            console.log('someone just voted');
            var votesDict = newValue.votes;
            var votesList = Object.keys(votesDict).map(k => { return { symbol: k, voteId: votesDict[k] }; });
            var numVoted = votesList.filter(v => v.voteId).length;
            var numNotVoted = votesList.filter(v => !v.voteId).length;

            var numMembers = newValue.members.length;
            console.log('members:', numMembers, 'voted:', numVoted, 'notVoted:', numNotVoted);

            if (numVoted === numMembers) {
                // process this vote into a result!

                var round = {
                    votes: votesList
                };
                checkIfCompleted(round, newValue.members);

                // make a round
                var timestamp = new Date().getTime();
                var id = `${newValue.positionId}_${timestamp}`;
                round.id = id;
                var path = `/votingRounds/${electionKey}/${id}`;
                console.log('add round', path);
                db.ref(path).set(round);

                // close voting for this round
                path = `/elections/${electionKey}`;
                console.log('close voting for this round', path);
                db.ref(path).update({
                    votingOpen: false
                });

                path = `/positions/${electionKey}/${newValue.positionId}`;
                console.log('update position', path);
                db.ref(path).update({
                    electedId: round.electedId
                });
            }
        } else {
            console.log('new', newValue, 'old', oldValue);
        }
        return 'done';
    });


function checkIfCompleted(round, memberIds) {
    var votes = round.votes;
    var numVotesRequired = 1 + Math.floor(memberIds.length / 2);

    var membersWithEnoughVotes = memberIds.filter(
        memberId => votes.filter(v => v.voteId === memberId).length >= numVotesRequired
    );

    console.log('check', numVotesRequired, memberIds, votes, membersWithEnoughVotes);

    if (membersWithEnoughVotes.length) {
        round.completed = true;
        // check if multiple? - can't happen...
        round.electedId = membersWithEnoughVotes[0];
    } else {
        round.completed = false;
        round.electedId = null;
    }
}


exports.onElectionChange = functions.database
    .ref('/elections/{electionKey}').onUpdate((change, context) => {
        const electionKey = context.params.electionKey;
        console.log('election changed', electionKey);

        const newValue = change.after.val();
        const oldValue = change.before.val();

        // console.log('new', newValue, 'old', oldValue);

        if (newValue.votingOpen && !oldValue.votingOpen) {
            console.log('voting just opened', newValue);
            // need to assign voting slots to members

            db.ref(`/voting/${electionKey}`).once('value', snapshot => {
                var voting = snapshot.val();

                // randomize the order
                var voteSymbols = Object.keys(voting.votes);

                var memberIds = voting.members.map(id => {
                    return { id: id, sort: Math.random() };
                });
                memberIds.sort((a, b) => (a.sort < b.sort ? -1 : 1));

                if (voteSymbols.length !== memberIds.length) {
                    // something went wrong!
                    console.log('voteSymbol !== membercount', voteSymbols.length, memberIds.length);
                    return false;
                }

                var path = `/voterSymbols/${electionKey}`;
                db.ref(path).remove();

                memberIds.forEach((memberInfo, i) => {
                    // tell this member their symbol
                    var symbol = voteSymbols[i];
                    path = `/voterSymbols/${electionKey}/${memberInfo.id}`;
                    console.log('give symbol', electionKey, memberInfo.id, symbol, path);
                    db.ref(path).update({ symbol: symbol });

                    // reset their voting flags
                    db.ref(`members/${electionKey}/${memberInfo.id}`).update({
                        voting: true,
                        preferNot: false,
                        voted: false
                    });
                })

                return 'distributed symbols';
            });

        } else if (!newValue.votingOpen && oldValue.votingOpen) {
            console.log('voting just closed');

            db.ref(`/members/${electionKey}`).once('value', snapshot => {
                var memberList = snapshot.val();

                Object.keys(memberList).forEach((memberId, i) => {
                    // reset their voting flags
                    db.ref(`members/${electionKey}/${memberId}`).update({
                        voting: false
                    });
                })

                return 'reset voting status for every member';
            });

        } else {
            console.log('new', newValue, 'old', oldValue);
        }
        return 'done';
    });


exports.onUserStatusChanged = functions.database.ref('/users/{uid}').onUpdate(
    (change, context) => {
        // const uid = context.params.uid;

        // Get the data written to Realtime Database
        const user = change.after.val();
        const status = user.status;
        const electionKey = user.electionKey;
        const memberId = user.memberId;

        console.log('status changed', memberId, electionKey, user);

        if (status === 'offline') {
            // only concerned about noticing when someone leaves the election

            var path = `/members/${electionKey}/${memberId}`;
            console.log('set', path);

            db.ref(path).update({
                connected: false
            });
            // .then(() => console.log('disconnected', version, memberId))
            // .catch(error => {
            //     console.log("Error disconnecting member.", error);
            // });
        }
        return 'done';
    });