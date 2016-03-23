var aws = require('aws-sdk');
var util = require('util');

var version = JSON.parse(require('fs').readFileSync(__dirname + '/package.json')).version;

var program = require('commander');
program
	.version(version)
	.option('-u, --user <user>', 'User override.  Uses process.env.EC2_SSH_USER by default')
	.option('-i, --identity <identity file>', 'SSH identity.  Passed to SSH process')
	.option('--region <region>', 'AWS region', 'us-east-1')
	.arguments('<tag> [tags...]')
	.parse(process.argv)

if (!program.args.length) {
	program.help()
}

var ec2 = new aws.EC2({
	region: program.region
});

var tags = program.args.reduce(function(tags, arg) {
	var nameAndVal = arg.split('=');
	var name = nameAndVal[0];
	var val = nameAndVal[1];

	if (val) {
		if (!Array.isArray(tags[name]))
			tags[name] = []

		tags[name].push(val);
	} else if (!tags[name]) {
		// if its already an array, we have a filter, so the existence check is ignored
		tags[name] = true;
	}

	return tags
}, {});


var filters = Object.keys(tags).map(function(tag) {
	var value = tags[tag];
	if (Array.isArray(value)) {
		return {
			Name: 'tag:' + tag,
			Values: value
		}
	} else {
		return {
			Name: 'tag-key',
			Values: [tag]
		}
	}
});

var params = {
	Filters: filters
};

ec2.describeInstances(params, function(err, data) {
	var ips = [];
	if (data) {
		ips = (data.Reservations || [])
			.map(function(res) {
				return res.Instances || []
			})
			.reduce(function(prev, curr) {
				return prev.concat(curr)
			}, [])
			.map(function(instance) {
				return instance.PublicIpAddress
			})
	}

	if (ips.length) {
		var sshArgs = [];
		if (program.identity) {
			sshArgs.push('-i')
			sshArgs.push(program.identity);
		}

		var user = program.user || process.env.EC2_SSH_USER;
		var ip = ips[0];
		if (user) ip = user + '@' + ip;
		sshArgs.push(ip);

		require('child_process').spawn('ssh', sshArgs, {
			detatched: true,
			stdio: 'inherit'
		});
	}
});