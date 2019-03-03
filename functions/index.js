// back end processes for TallyJ Officer
// include a version number in logs to know when a new version of this code is in use
const version = 31;

console.log('version', version, 'registered');

const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();
// const firestore = admin.firestore();
const db = admin.database();

exports.onElectionChange = functions.database.ref('/elections/{electionKey}')
    .onUpdate((change, context) => {
        const electionKey = context.params.electionKey;
        console.log('election changed', electionKey);
        const newValue = change.after.val();
        const oldValue = change.before.val();
        console.log('new', newValue, 'old', oldValue);

        if (newValue.votingOpen && !oldValue.votingOpen) {
            console.log('voting just opened', newValue);
            // need to assign voting slots to members

            // randomize the order
            var memberIds = newValue.members.map(id => {
                return { id: id, sort: Math.random() };
            });
            memberIds.sort((a, b) => (a.sort < b.sort ? -1 : 1));

            var voteSymbols = Object.keys(newValue.currentVotes);

            if (voteSymbols.length !== memberIds.length) {
                // something went wrong!
                console.log('voteSymbol !== membercount', voteSymbols.length, memberIds.length);
                return false;
            }

            memberIds.forEach((memberInfo, i) => {
                // tell this member their symbol
                var symbol = voteSymbols[i];
                var path = `/users/${electionKey}/${memberInfo.id}`;
                console.log('set', electionKey, memberInfo.id, symbol, path);

                db.ref(path).update({ symbol: symbol });

                //--> Firestore is way too slow to distribute info to members - sometimes up to 30 seconds!

                // firestore.collection('elections').doc(electionKey).collection('memberSymbols').doc(memberInfo.id)
                //     .set({
                //         symbol: voteSymbols[i]
                //     })
                //     .then(() => {
                //         console.log("Symbol successfully written!");
                //         return true;
                //     })
                //     .catch((error) => {
                //         console.error("Error writing symbol: ", error);
                //     });


            })
        } else if (JSON.stringify(newValue.currentVotes) !== JSON.stringify(oldValue.currentVotes)) {
            console.log('someone just voted');
            var votesDict = newValue.currentVotes;
            var votesList = Object.keys(votesDict).map(k => { return { symbol: k, vote: votesDict[k] }; });
            var numVoted = votesList.filter(v => v.vote).length;
            var numNotVoted = votesList.filter(v => !v.vote).length;

            var numMembers = newValue.members.length;
            console.log('members:', numMembers, 'voted:', numVoted, 'notVoted:', numNotVoted);

            if (numVoted === numMembers) {
                // process this vote!

                const timeStamp = new Date().getTime();

                var round = {
                    id: newValue.positionIdToVoteFor +
                        "_" +
                        timeStamp,
                    // want to number it based on how many are already there, but can't easily with firestore
                    // ("00" + this.positionRounds.length).slice(-3),
                    votes: votes
                };
                this.checkIfCompleted(newValue.members, round);

                var path = `/elections/${electionKey}/positions/${newValue.positionIdToVoteFor}/rounds/${round.id}`;
                console.log('set', path);

                db.ref(path).set(round);

                // firestore
                //     .collection("elections")
                //     .doc(electionKey)
                //     .collection("positions")
                //     .doc(newValue.positionIdToVoteFor)
                //     .collection("rounds")
                //     .doc(round.id)
                //     .set(round)
                //     .then(() => console.log('saved round', timeStamp))
                //     .catch(error => {
                //         console.log("Error saving round.", error);
                //     });

                path = `/elections/${electionKey}`;
                console.log('set', path);

                db.ref(path).update({
                    votingOpen: false
                });

                // firestore
                //     .collection("elections")
                //     .doc(electionKey)
                //     .update({
                //         votingOpen: false
                //     })
                //     .then(() => console.log('voting closed'))
                //     .catch(error => {
                //         console.log("Error closing voting.", error);
                //     });
            }

        } else {
            console.log('new', newValue, 'old', oldValue);
        }
        return 'done';
    });

function checkIfCompleted(memberIds, round) {
    var votes = round.votes;
    var numVotesRequired = 1 + Math.floor(memberIds.length / 2);

    var membersWithEnoughVotes = membersIds.filter(
        m => votes.filter(v => v.id === m.id).length >= numVotesRequired
    );
    if (membersWithEnoughVotes.length) {
        // check if multiple? - can't happen...
        var elected = membersWithEnoughVotes[0];
        round.elected = elected;
        round.completed = true;
    } else {
        round.elected = false;
        round.completed = false;
    }
}

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

            var path = `/elections/${electionKey}/members/${memberId}`;
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