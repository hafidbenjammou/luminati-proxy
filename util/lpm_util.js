#!/usr/bin/env node
// LICENSE_CODE ZON ISC
'use strict'; /*jslint node:true, esnext:true*/
const yargs = require('yargs');
const semver = require('semver');
const pkg = require('../package.json');
const perr = require('../lib/perr.js');
const lpm_config = require('./lpm_config.js');
const zerr = require('../util/zerr.js');
const zutil = require('../util/util.js');
const E = module.exports;

const parse_env_params = (env, fields)=>{
    const params = {};
    for (const [field, value] of Object.entries(fields))
    {
        const key = 'PMGR_'+field.toUpperCase();
        if (!env[key])
            continue;
        switch (value.type)
        {
        case 'string':
            if (value.pattern && !(new RegExp(value.pattern)).test(env[key]))
                zerr.zexit(key+' wrong value pattern '+value.pattern);
            params[field] = env[key];
            break;
        case 'integer':
            params[field] = Number.parseInt(env[key]);
            if (!Number.isInteger(params[field]))
                zerr.zexit(key+' not a number '+env[key]);
            break;
        case 'boolean':
            if (!['0', '1', 'false', 'true'].includes(env[key]))
                zerr.zexit(key+' wrong boolean value '+env[key]);
            params[field] = ['1', 'true'].includes(env[key]);
            break;
        case 'array':
            params[field] = env[key].split(';');
            break;
        case 'object':
            try { params[field] = JSON.parse(env[key]); }
            catch(e){ zerr.zexit(key+' contains invalid JSON: '+env[key]); }
            break;
        }
    }
    return params;
};
E.t = {parse_env_params};

const explicit_mgr_opt = (argv, native_args=[])=>{
    const mgr_opts = zutil.pick(argv, ...lpm_config.mgr_fields);
    return native_args.reduce((obj, arg)=>{
        let k = arg.replace(/^--/, ''), v = mgr_opts[k];
        return Object.assign(obj,
            arg.startsWith('--') && v!==undefined && {[k]: v});
    }, {});
};

E.init_args = args=>{
    const usage = ['Usage:\n  $0 [options] config1 config2 ...'];
    if (process.env.DOCKER)
    {
        usage.unshift('  docker run luminati/luminati-proxy '
            +'[docker port redirections]');
    }
    const defaults = Object.assign({}, lpm_config.manager_default,
        parse_env_params(process.env, lpm_config.proxy_fields));
    args = (args||process.argv.slice(2)).map(String);
    const argv = yargs(args)
    .usage(usage.join(' \n'))
    .options(lpm_config.proxy_fields)
    .describe(lpm_config.args.added_descriptions)
    .number(lpm_config.numeric_fields)
    .default(defaults)
    .help()
    .strict()
    .version(pkg.version)
    .alias(lpm_config.args.alias)
    .parse();
    argv.native_args = args;
    argv.log = argv.log.toLowerCase();
    if (argv.session=='true')
        argv.session = true;
    argv.explicit_proxy_opt = zutil.pick(argv, ...[...lpm_config.proxy_params,
        'test_url'].filter(p=>args.includes(`--${p}`)));
    argv.explicit_mgr_opt = explicit_mgr_opt(argv, args);
    if (args.includes('-p'))
        argv.explicit_proxy_opt.port = argv.port;
    argv.daemon_opt = args.filter(arg=>arg.includes('daemon')||arg=='-d')
    .map(arg=>{
        let match;
        if (arg=='-d'||arg=='--daemon')
            arg = '--start-daemon';
        if (!(match = arg.match(/--([^-]*)-daemon(=.*)?/)))
            return null;
        return {
            daemon: true,
            name: match[1],
            value: match[2],
        };
    })
    .reduce((acc, curr)=>{
        if (curr)
            acc[curr.name] = curr.value||true;
        return acc;
    }, {});
    perr.enabled = !argv.no_usage_stats;
    return argv;
};

E.check_node_version = ()=>{
    let anv = process.versions.node;
    let {min_node: cmn, max_node: cmx} = lpm_config;
    let valid = semver.satisfies(anv, `${cmn} - ${cmx}`);
    let msg = 'Your nodejs version does not match the requirements.'
        +`\nMin: ${cmn}, Max: ${cmx}, Actual: ${anv}. Proxy Manager may`
        +' work unstable.';
    return !valid ? msg : null;
};
