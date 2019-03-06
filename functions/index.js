// back end processes for TallyJ Officer
// include a version number in logs to know when a new version of this code is in use
const version = 59;

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

            console.log('votes changed');
            var votesDict = newValue.votes;
            var votesList = Object.keys(votesDict).map(k => { return { symbol: k, voteId: votesDict[k] }; });
            var numVoted = votesList.filter(v => v.voteId).length;
            var numNotVoted = votesList.filter(v => !v.voteId).length;

            console.log('voted:', numVoted, ' - notVoted:', numNotVoted);

            if (numNotVoted === 0) {
                // process this vote into a result!
                db.ref(`/members/${electionKey}`).once('value', snapshot => {
                    var members = snapshot.val();
                    var memberIds = Object.keys(members);

                    var round = {
                        votes: votesList
                    };
                    checkIfCompleted(round, memberIds);

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

                db.ref(`/members/${electionKey}`).once('value', snapshot => {
                    var members = snapshot.val();
                    var membersList = Object.values(members);
                    var participantsList = membersList.filter(m => m.participating);

                    var participantInfos = participantsList.map(participant => {
                        return {
                            id: participant.id,
                            sort: Math.random()
                        };
                    });

                    var voteSlots = Object.keys(voting.votes);

                    if (voteSlots.length !== participantInfos.length) {
                        // something went wrong!
                        console.log('num voting !== participants', voteSlots.length, participantInfos.length);
                        return false;
                    }

                    var path = `/voterSymbols/${electionKey}`;
                    db.ref(path).remove();

                    // randomize the order
                    participantInfos.sort((a, b) => (a.sort < b.sort ? -1 : 1));

                    participantInfos.forEach((participantInfo, i) => {
                        // tell this member their symbol
                        var symbol = voteSlots[i];
                        path = `/voterSymbols/${electionKey}/${participantInfo.id}`;
                        console.log('give symbol', electionKey, participantInfo.id, symbol, path);
                        db.ref(path).update({ symbol: symbol });

                        // reset their voting flags
                        db.ref(`members/${electionKey}/${participantInfo.id}`).update({
                            preferNot: false,
                            voted: false
                        });
                    })
                })

                return 'distributed symbols';
            });

        } else if (!newValue.votingOpen && oldValue.votingOpen) {
            console.log('voting just closed');

            db.ref(`/members/${electionKey}`).once('value', snapshot => {
                var members = snapshot.val();
                var membersList = Object.values(members);

                membersList.forEach(member => {
                    // reset their voting flags
                    // if (member.connected) {
                    var path = `/members/${electionKey}/${member.id}`;
                    console.log(`set voting false for ${path}`)
                    db.ref(path).update({
                        voting: false
                    });
                    // }
                })

                return 'reset voting status for every member';
            });

        } else {
            console.log('misc election change new', newValue, 'old', oldValue);
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
            console.log('connected false for', path);

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