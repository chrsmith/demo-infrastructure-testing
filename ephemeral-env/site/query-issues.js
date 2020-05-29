// Use a GitHub proxy (for only GET requests) hosted along with this site.
var originalGithubBaseURL = "https://api.github.com";
var githubBaseURL = "github";
var githubHeaders = {}
// To access the API directly (e.g. running on localhost), uncomment below:
// const githubBaseURL = "https://api.github.com";
// const githubAccessToken = "xxxxxxxxxxxxxxxxxxxxx";
// var githubHeaders = { "Authorization": `token ${githubAccessToken}` };

function escapeHtmlChars(s) {
    const entityMap = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
        '/': '&#x2F;',
        '`': '&#x60;',
        '=': '&#x3D;'
    };

    return String(s).replace(/[&<>"'`=\/]/g, function (r) {
        return entityMap[r];
    });
}

function parseLinkHeader(header) {
    const links = {};
    if (header) {
        for (let part of header.split(",")) {
            const link = part.split(";");
            if (link.length === 2) {
                const url = link[0].replace(/<(.*)>/, "$1").trim();
                const name = link[1].replace(/rel="(.*)"/, "$1").trim();
                links[name] = url;
            }
        }
    }
    return links;
}

const priorityPrefix = "priority/";

function getIssuePriority(issue) {
    for (const label of issue.labels) {
        if (label.name.indexOf(priorityPrefix) === 0) {
            return parseInt(label.name.substring(priorityPrefix.length + 1));
        }
    }
    return undefined;
}

function getIssuePriorityRow(issue) {
    for (const label of issue.labels) {
        if (label.name.indexOf(priorityPrefix) === 0) {
            return "<td style='background: #" + label.color + "; color: #fff; font-weight: bold'>P" +
                label.name.substring(priorityPrefix.length + 1) + "</td>";
        }
    }
    return "<td></td>";
}

function initSelectOptions(box, def, opts, selected) {
    console.log("initSelectOptions", box, def, opts, selected);
    // Remove old orgs.
    box.empty();

    // Add a top empty option with the given key/value.
    if (def) {
        box.append($("<option></option>")
            .attr("value", "").text(def));
    }

    // Sort the list (by value, not key, so the display looks nice).
    const ents = [];
    if (opts instanceof Array) {
        $.each(opts, function (k, v) {
            ents.push({ key: v, val: v });
        });
    } else {
        for (let key of Object.keys(opts)) {
            ents.push({ key: key, val: opts[key] });
        }
    }
    ents.sort((a, b) => {
        if (a.val < b.val) {
            return -1;
        } else if (a.val > b.val) {
            return 1;
        } else {
            return 0;
        }
    });

    // Now add the real entries.
    $.each(ents, function (i, e) {
        box.append($("<option></option>")
            .attr("value", e.key).text(e.val));
    });

    // If there is a default, select it.
    if (selected || selected === "") {
        box.val(selected);
        box.change();
    }
}


//If you want to show private organizations that the backing API has
//access to, you can use this code below.

// First, populate the orgs box, in sorted order.
// $.ajax({
//     url: githubBaseURL + "/user/orgs",
//     headers: githubHeaders,
//     dataType: "json",
//     success: function (orgs) {
//         initSelectOptions(
//             $("#org"),
//             "Select an org",
//             $.map(orgs, o => o.login),
//             "pulumi",
//         );
//     },
// });

// For CircleCI demo.

// Anytime the org changes, refresh the repos.
$(document).on("change", "#org", function (e) {
    console.log("org changed...");
    const org = $(this).val();
    if (org) {
        let allRepos = [];
        const getMoreRepos = function (url) {
            $.ajax({
                url: url,
                headers: githubHeaders,
                dataType: "json",
                success: function (repos) {
                    for (const repo of repos) {
                        if (repo.archived) {
                            continue;
                        }
                        allRepos.push(repo);
                    }
                },
                complete: function (req) {
                    // If there are more pages, follow them.
                    const linkHeader = req.getResponseHeader("link");
                    if (linkHeader) {
                        const links = parseLinkHeader(linkHeader);
                        if (links.next) {
                            getMoreRepos(links.next.replace(originalGithubBaseURL, githubBaseURL));
                            return;
                        }
                    }

                    // No more repos, we're done, return the list.
                    initSelectOptions(
                        $("#repos"),
                        "All repos",
                        $.map(allRepos, r => r.full_name),
                        "",
                    );
                },
            });
        };
        getMoreRepos(githubBaseURL + "/orgs/" + org + "/repos");
    }
});

function getCurrentRepos(repoBox) {
    let repos = $(repoBox).val();
    if (!repos || repos.every(function (repo) { return repo === ""; })) {
        // If there are no repos, select all of them.
        repos = [];
        for (let opt of repoBox.options) {
            if (opt.value) {
                repos.push(opt.value);
            }
        }
    }
    return repos;
}

// Anytime the repos change, refresh the milestones.
$(document).on("change", "#repos", function (e) {
    const repos = getCurrentRepos(this);
    if (repos) {
        async.map(
            repos,
            function (repo, callback) {
                $.ajax({
                    url: githubBaseURL + "/repos/" + repo + "/milestones",
                    headers: githubHeaders,
                    dataType: "json",
                    success: function (milestones) {
                        callback(undefined, milestones);
                    },
                    error: function (xhr, status, error) {
                        callback(error);
                    },
                });
            },
            function (err, results) {
                let earliest;
                let earliestTitle;
                const milestones = { "title": "(none)" };

                if (results) {
                    // Flatten results.
                    results = [].concat.apply([], results);

                    // Dedupe results and then list them in sorted order.
                    for (let result of results) {
                        if (result && result.state === "open") {
                            milestones[result.title] = result.title;

                            // If this is the earliest milestone that is open, select it by default.
                            if (result.due_on) {
                                const dueDate = moment(result.due_on);
                                if (!earliest || dueDate < earliest) {
                                    earliest = dueDate;
                                    earliestTitle = result.title;
                                }
                            }
                        }
                    }
                }

                initSelectOptions(
                    $("#milestone"),
                    "Select a milestone",
                    milestones,
                    earliestTitle,
                );

                // TODO: sort via semver.
                // TODO: select the current milestone (earliest open).
            }
        );
    }
});

// Anytime the selected milestone changes, draw the box with all the work item details.
$(document).on("change", "#milestone", function (e) {
    const ms = $(this).val();
    if (ms) {
        // For each selected repo, figure out the milestone ID, and then accumulate a list of issues.
        // Only once all queries have completed will we have a full list of users, etc.
        let dueDate;
        let now = Date.now();
        const repos = getCurrentRepos($("#repos")[0]);
        if (repos) {
            // Populate the open issues:
            async.map(
                repos,
                function (repo, callback) {
                    $.ajax({
                        url: githubBaseURL + "/repos/" + repo + "/milestones?state=open",
                        headers: githubHeaders,
                        dataType: "json",
                        success: function (milestones) {
                            let found = false;
                            for (let milestone of milestones) {
                                if (milestone.title === ms) {
                                    if (milestone.due_on) {
                                        // TODO: detect conflicts.
                                        dueDate = moment(milestone.due_on);
                                        if (dueDate < now) {
                                            dueDate = now;
                                            $("#days_left").text("0 days");
                                        } else {
                                            const daysLeft = moment.duration(now - dueDate);
                                            // TODO: only show business days.
                                            $("#days_left").text(daysLeft.humanize());
                                        }
                                    }
                                    let issues = [];
                                    const getMoreIssues = function (url) {
                                        console.log("getting issues at: " + url);
                                        $.ajax({
                                            url: url,
                                            headers: githubHeaders,
                                            dataType: "json",
                                            success: function (moreIssues) {
                                                for (let issue of moreIssues) {
                                                    if (issue.pull_request) { // skip PRs.
                                                        continue;
                                                    }
                                                    issue.repo = repo;
                                                    issues.push(issue);
                                                }
                                            },
                                            complete: function (req) {
                                                // See if there are additional pages; if yes, follow them.
                                                const linkHeader = req.getResponseHeader("link");
                                                if (linkHeader) {
                                                    const links = parseLinkHeader(linkHeader);
                                                    if (links.next) {
                                                        getMoreIssues(links.next.replace(originalGithubBaseURL, githubBaseURL));
                                                        return;
                                                    }
                                                }

                                                // No more issues, we're done.  Return the issues list.
                                                callback(undefined, issues);
                                            },
                                        });
                                        found = true;
                                    };
                                    getMoreIssues(githubBaseURL + "/repos/" + repo + "/issues?milestone=" +
                                        milestone.number + "&state=all");
                                    break;
                                }
                            }
                            if (!found) {
                                callback(undefined, []);
                            }
                        },
                    });
                },
                function (err, issues) {
                    // Create a map of users to their issues.
                    const userOpenIssues = {};
                    const userClosedIssues = {};
                    if (issues) {
                        issues = [].concat.apply([], issues);
                    }
                    for (let issue of issues) {
                        let user;
                        if (issue.assignee) {
                            user = issue.assignee.login;
                        } else if (issue.assignees && issue.assignees.length) {
                            user = issue.assignees[0].login;
                        } else {
                            user = "";
                        }
                        if (issue.state === "open") {
                            // Show all open in this milestone.
                            if (!userOpenIssues[user]) {
                                userOpenIssues[user] = [];
                            }
                            userOpenIssues[user].push(issue);
                        } else if (issue.state === "closed") {
                            if (!userClosedIssues[user]) {
                                userClosedIssues[user] = [];
                            }
                            userClosedIssues[user].push(issue);
                        }
                    }

                    // Sort things; first by priority -- P0, P1, untagged, P2, and then by update date.
                    const priUpdateDateComparator = (a, b) => {
                        // First, detect the priority; 0 < 1 < ... < 2
                        let pa = getIssuePriority(a);
                        let pb = getIssuePriority(b);
                        if (pa === 2) pa++;
                        if (pb === 2) pb++;
                        if (pa === undefined) pa = 2;
                        if (pb === undefined) pb = 2;
                        const pdiff = pa - pb;
                        if (pdiff !== 0) {
                            return pdiff;
                        }

                        // For matching priorities, sort so that most recently updated is at top.
                        const au = moment(a.updated_at);
                        const bu = moment(b.updated_at);
                        if (au.isAfter(bu)) {
                            return -1;
                        } else if (au.isBefore(bu)) {
                            return 1;
                        } else {
                            return 0;
                        }
                    };
                    for (const user of Object.keys(userOpenIssues)) {
                        userOpenIssues[user].sort(priUpdateDateComparator);
                    }
                    for (const user of Object.keys(userClosedIssues)) {
                        userClosedIssues[user].sort(priUpdateDateComparator);
                    }

                    // Now, render the open issues in the table.
                    $("#people_issues tbody").empty();
                    let odd = false;
                    let openCount = 0;
                    for (const user of Object.keys(userOpenIssues).sort()) {
                        let userRowColor;
                        if (!user) {
                            // Untriaged, so orange.
                            userRowColor = "#fa3";
                        } else {
                            if (odd) {
                                userRowColor = "#fff";
                            } else {
                                userRowColor = "#eff";
                            }
                            odd = !odd;
                        }

                        let days = 0;
                        let first = true;
                        for (const issue of userOpenIssues[user]) {
                            const userName = (first ? (user || "&lt;unassigned&gt;") : "");
                            const sinceCreated = now - moment(issue.created_at);
                            const sinceUpdated = now - moment(issue.updated_at);
                            $("#people_issues tbody").append(
                                "<tr style='background: " + userRowColor + "'>" +
                                "<td><b>" + userName + "</b></td>" +
                                "<td><a href='" + issue.html_url + "' target=_blank>" +
                                issue.repo + "#" + issue.number + "</a></td>" +
                                getIssuePriorityRow(issue) +
                                "<td>" + escapeHtmlChars(issue.title) + "</td>" +
                                "<td></td>" +
                                "<td><p title='" + issue.created_at + "'>" +
                                moment.duration(sinceCreated).humanize() + "</p></td>" +
                                "<td><p title='" + issue.updated_at + "'>" +
                                moment.duration(sinceUpdated).humanize() + "</p></td>" +
                                "</tr>"
                            );
                            days++; // count each bug as 1d; TODO: better.
                            first = false;
                            openCount++;
                        }

                        if (user) {
                            let dayLabel = days;
                            let dayRowColor = "#7f7";
                            const overUnder = new Date();
                            overUnder.setDate(overUnder.getDate() + days);
                            if (overUnder > dueDate) {
                                dayLabel += " (+" + moment.duration(overUnder - dueDate).days() + ")";
                                dayRowColor = "#f77";
                            }

                            $("#people_issues tbody").append(
                                "<tr style='background: " + userRowColor + "'>" +
                                "<td></td>" +
                                "<td></td>" +
                                "<td></td>" +
                                "<td></td>" +
                                "<td style='background: " +
                                dayRowColor + "'><b>" + dayLabel + "</b></td>" +
                                "<td></td>" +
                                "<td></td>" +
                                "</tr>"
                            );
                        }
                    }
                    $("#open_count").text("[" + openCount + "]");

                    // Now, render the closed issues in the table.
                    $("#people_issues_closed tbody").empty();
                    odd = false;
                    let closedCount = 0;
                    for (const user of Object.keys(userClosedIssues).sort()) {
                        let userRowColor;
                        if (!user) {
                            // Untriaged, so orange.
                            userRowColor = "#fa3";
                        } else {
                            if (odd) {
                                userRowColor = "#fff";
                            } else {
                                userRowColor = "#eff";
                            }
                            odd = !odd;
                        }

                        let days = 0;
                        let first = true;
                        for (const issue of userClosedIssues[user]) {
                            const userName = (first ? (user || "&lt;unassigned&gt;") : "");
                            const sinceCreated = now - moment(issue.created_at);
                            const sinceUpdated = now - moment(issue.updated_at);
                            $("#people_issues_closed tbody").append(
                                "<tr style='background: " + userRowColor + "'>" +
                                "<td><b>" + userName + "</b></td>" +
                                "<td><a href='" + issue.html_url + "' target=_blank>" +
                                issue.repo + "#" + issue.number + "</a></td>" +
                                getIssuePriorityRow(issue) +
                                "<td>" + escapeHtmlChars(issue.title) + "</td>" +
                                "<td></td>" +
                                "<td><p title='" + issue.created_at + "'>" +
                                moment.duration(sinceCreated).humanize() + "</p></td>" +
                                "<td><p title='" + issue.updated_at + "'>" +
                                moment.duration(sinceUpdated).humanize() + "</p></td>" +
                                "</tr>"
                            );
                            days++;
                            first = false;
                            closedCount++;
                        }

                        if (user) {
                            $("#people_issues_closed tbody").append(
                                "<tr style='background: " + userRowColor + "'>" +
                                "<td></td>" +
                                "<td></td>" +
                                "<td></td>" +
                                "<td></td>" +
                                "<td style='background: #ccc'><b>" + days + "</b></td>" +
                                "<td></td>" +
                                "<td></td>" +
                                "</tr>"
                            );
                        }
                    }

                    $("#closed_count").text("[" + closedCount + "]");
                },
            );
        }
    }
});

// Start initial population.
initSelectOptions(
    $("#org"),
    "Select an org",
    ["golang"],
    "golang",
);
