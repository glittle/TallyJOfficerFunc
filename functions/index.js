// back end processes for TallyJ Officer
// include a version number in logs to know when a new version of this code is in use
const version = 77;
console.log("tallyj officer version", version, "registered");

const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();
// const firestore = admin.firestore();
const db = admin.database();
console.log("tallyj officer database", db.repoInternal_ ? db.repoInternal_.key : '?');

exports.onVotingChange = functions.database
    .ref("/voting/{electionKey}")
    .onUpdate((change, context) => {
        const electionKey = context.params.electionKey;

        const newValue = change.after.val();
        const oldValue = change.before.val();

        console.log('tallyj officer voting old', oldValue, ' --> new', newValue);

        // console.log('new', newValue, 'old', oldValue);

        if (JSON.stringify(newValue.votes) !== JSON.stringify(oldValue.votes)) {
            var votesDict = newValue.votes;
            var votesList = Object.keys(votesDict).map(k => {
                return { symbol: k, voteId: votesDict[k] };
            });
            var numVoted = votesList.filter(v => v.voteId).length;
            var numNotVoted = votesList.filter(v => !v.voteId).length;

            console.log(
                "vote changed",
                electionKey,
                "voted:",
                numVoted,
                " - notVoted:",
                numNotVoted
            );

            if (numNotVoted === 0) {
                // process this vote into a result!
                db.ref(`/members/${electionKey}`).once("value", snapshot => {
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
                    // console.log('add round', path);
                    db.ref(path).set(round);

                    // close voting for this round
                    path = `/elections/${electionKey}`;
                    // console.log('close voting for this round', path);
                    db.ref(path).update({
                        votingOpen: false
                    });

                    path = `/positions/${electionKey}/${newValue.positionId}`;
                    // console.log('update position', path);
                    db.ref(path).update({
                        electedId: round.electedId
                    });
                });
            }
        } else {
            // console.log('new', newValue, 'old', oldValue);
        }
        return "done";
    });

function checkIfCompleted(round, memberIds) {
    var votes = round.votes;
    var numVotesRequired = 1 + Math.floor(memberIds.length / 2);

    var membersWithEnoughVotes = memberIds.filter(
        memberId =>
            votes.filter(v => v.voteId === memberId).length >= numVotesRequired
    );

    // console.log('check', numVotesRequired, memberIds, votes, membersWithEnoughVotes);

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
    .ref("/elections/{electionKey}")
    .onUpdate((change, context) => {
        const electionKey = context.params.electionKey;

        const newValue = change.after.val();
        const oldValue = change.before.val();

        //console.log('tallyj officer election old', oldValue, ' --> new', newValue);

        if (newValue.votingOpen && !oldValue.votingOpen) {
            console.log("voting just opened", electionKey, newValue);
            // need to assign voting slots to members

            db.ref(`/voting/${electionKey}`).once("value", snapshot => {
                var voting = snapshot.val();

                db.ref(`/members/${electionKey}`).once("value", snapshot => {
                    var members = snapshot.val();
                    var membersList = Object.keys(members).map(id => members[id]);
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
                        console.log(
                            "num voting !== participants",
                            voteSlots.length,
                            participantInfos.length
                        );
                        return false;
                    }

                    var path = `/voterSymbols/${electionKey}`;
                    db.ref(path).remove();

                    // randomize the order
                    participantInfos.sort((a, b) => (a.sort < b.sort ? -1 : 1));

                    console.log(
                        `give symbols to ${participantInfos.length} participants`,
                        electionKey
                    );

                    participantInfos.forEach((participantInfo, i) => {
                        // tell this member their symbol
                        var symbol = voteSlots[i];
                        path = `/voterSymbols/${electionKey}/${participantInfo.id}`;
                        db.ref(path).update({ symbol: symbol });

                        // reset their voting flags
                        db.ref(`members/${electionKey}/${participantInfo.id}`).update({
                            preferNot: false,
                            voted: false
                        });
                    });

                    return "distributed symbols";
                });

                return "distributed symbols";
            });

            return "distributed symbols";
        }

        if (!newValue.votingOpen && oldValue.votingOpen) {
            console.log("tallyj officer voting just closed", electionKey);

            db.ref(`/members/${electionKey}`).once("value", snapshot => {
                var members = snapshot.val();
                var membersList = Object.keys(members).map(id => members[id]);

                membersList.forEach(member => {
                    // reset their voting flags
                    // if (member.connected) {
                    var path = `/members/${electionKey}/${member.id}`;
                    // console.log(`set voting false for ${path}`)
                    db.ref(path).update({
                        voting: false
                    });
                    // }
                });

                return "reset voting status for every member";
            });

            return "reset voting status for every member";
        }

        if (newValue.deleteMe) {
            console.log("tallyj officer delete election", electionKey);

            // first approach was to delete one by one, but it is too fast to be interesting for the user
            // delete everything...
            deleteItems("elections", electionKey);
            deleteItems("members", electionKey);
            deleteItems("positions", electionKey);
            deleteItems("votingRounds", electionKey);
            deleteItems("voting", electionKey);
            deleteItems("voterSymbols", electionKey);

            return "deleted election";
        }

        console.log("tallyj officer misc election change (no action taken) new", newValue, "old", oldValue);
        return "done";
    });

function deleteItems(section, electionKey, cb) {
    var sectionPath = `/${section}/${electionKey}`;

    console.log("tallyj officer deleting", section);

    // if (oneByOne) {
    //     db.ref(sectionPath).once("value", snapshot => {
    //         snapshot.forEach(itemSnapshot => {
    //             var itemKey = itemSnapshot.key;
    //             console.log("remove", `${sectionPath}/${itemKey}`);
    //             db.ref(`${sectionPath}/${itemKey}`).remove();
    //         });

    //         console.log("remove 1", sectionPath);
    //         db.ref(sectionPath)
    //             .remove()
    //             .then(() => {
    //                 if (cb) {
    //                     return cb();
    //                 }
    //                 return "done";
    //             })
    //             .catch(error => {
    //                 console.log("error", error);
    //             });

    //         return "done";
    //     });
    // }

    db.ref(sectionPath)
        .remove()
        .then(() => {
            if (cb) {
                return cb();
            }
            return "done";
        })
        .catch(error => {
            console.log("error", error);
        });
}

exports.onUserStatusChanged = functions.database
    .ref("/users/{uid}")
    .onUpdate((change, context) => {
        // const uid = context.params.uid;
        // console.log('user context', context);
        // Get the data written to Realtime Database
        var uid = context.params.uid;
        const user = change.after.val();
        const status = user.status;
        const electionKey = user.electionKey;
        const memberId = user.memberId;

        console.log('tallyj officer status changed', status, uid, electionKey, memberId, user);

        if (status === "offline" && memberId) {
            // only concerned about noticing when someone leaves the election

            var path = `/elections/${electionKey}`;
            db.ref(path).once("value", snapshot => {

                // make sure election has not just been deleted
                if (snapshot.exists()) {
                    switch (memberId[0]) {
                        case 'm':
                            path = `/members/${electionKey}/${memberId}`;
                            db.ref(path).update({
                                connected: false
                            });
                            break;
                        case 'v':
                            path = `/viewers/${electionKey}/${memberId}`;
                            db.ref(path).update({
                                connected: false
                            });
                            break;
                        default:
                            return;
                    }
                    console.log('status changed path', path);
                }
            });
        }

        return "done";
    });