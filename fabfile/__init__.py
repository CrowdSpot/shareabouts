#!/usr/bin/env python
# -*- coding: utf-8 -*-
#
# It looks to a python module (pointed to by HOST_ROLES env. var)
# for roles (groups of hosts) to work on.
#
# Examples:
#   `HOST_ROLES=serverroles fab deploy`
#        will prompt for role selection from the serverroles python module.
#   `HOST_ROLES=serverroles fab -R staging deploy`
#        would deploy to whatever staging servers are setup.
#   `HOST_ROLES=serverroles fab -H mytests.local`
#        would deploy to the single host mytest.local.
#   `HOST_ROLES=serverroles fab deploy`
#        will prompt for role selection before deploying.

import os
import sys

from fabric.api import abort, env, hide, local, prefix, settings, show, task
from fabric.contrib.console import confirm
from fabric.decorators import roles, runs_once
from fabric.operations import prompt, run

from fabfile.commands import *


# defaults for conforming puppet-managed vhost instances
DEFAULT_VHOST_PATH = '/home/vhosts/'
DEFAULT_REPO_NAME = 'repo.git' # a bare repo sent to with send-pack
# whether to default to restarting sync and async gunicorn workers
DEFAULT_SYNC = True
DEFAULT_ASYNC = False
# default for restarting celery workers
DEFAULT_CELERY = False
DEFAULT_WORKTREE = 'code'
DEFAULT_REQUIREMENTS = 'requirements.txt'

try:
    host_roles = os.environ['HOST_ROLES']
except KeyError:
    host_roles = "roles"

# set env.vhosts from the python module…
try:
    fab_roles = __import__(host_roles)
except ImportError:
    raise RuntimeError("Couldn't import your project roles!")

vhosts = getattr(fab_roles, 'vhosts', None)

env.forward_agent = True


if vhosts != None:
    for vhost in vhosts.keys():
        vhosts[vhost]['vhostpath'] = \
            vhosts[vhost].get('vhostpath', DEFAULT_VHOST_PATH + vhost)
        vhosts[vhost]['reponame'] = \
            vhosts[vhost].get('reponame', DEFAULT_REPO_NAME)
        vhosts[vhost]['sync'] = \
            vhosts[vhost].get('sync', DEFAULT_SYNC)
        vhosts[vhost]['async'] = \
            vhosts[vhost].get('async', DEFAULT_ASYNC)
        vhosts[vhost]['celery'] = \
            vhosts[vhost].get('celery', DEFAULT_CELERY)
        vhosts[vhost]['worktree'] = \
            vhosts[vhost].get('worktree', DEFAULT_WORKTREE)
        vhosts[vhost]['requirements'] = \
            vhosts[vhost].get('requirements', DEFAULT_REQUIREMENTS)

    env.vhosts = vhosts

    # env.roledefs is used internally by Fabric, so preserve that behaviour
    for vhost in env.vhosts.keys():
        env.roledefs.update({
                vhost: env.vhosts[vhost]['hosts']
                })

    # only prompt for a role later if we're not running a side-effect free
    # command.
    do_something = True
    quick_cmds = ('-l', '--list', 'check_clean', 'c', 'test', 't',
                      'roles', 'listroles')
    for arg in sys.argv:
        if arg in quick_cmds:
            do_something = False
            continue

# If Fabric is called without specifying either a *role* (group of
# predefined servers) or at least one *host* (via the -H argument),
# then prompt the user to choose a role from the predefined roledefs
# list.  This way, the env.hosts list is constructed at script load
# time and all the functions can use it when they run (by the time
# fabric commands are run the environment should already be set up
# with all the required host information!).
if vhosts is None:
    pass
elif do_something and (not env.roles and not env.hosts):
    validgrp = prompt("Choose host group [%s]: " % \
                          ", ".join(env.roledefs.keys()),
                      validate=lambda x: x in env.roledefs.keys() and x)
    if not validgrp:
        abort('No such group of hosts.')
    if hasattr(env.roledefs[validgrp], '__call__'):
        # if the role definition value is callable, call it to get the
        # list of hosts.
        print "Retrieving list of hosts",
        sys.stdout.flush()
        rawhosts = env.roledefs[validgrp]()
        hosts = [host['address'] for host in rawhosts]
        hostnames = [host['name'] for host in rawhosts]
        print "OK"
    else:
        hostnames = hosts = env.roledefs[validgrp]
        env.hosts.extend(hosts)
    if not confirm("Acting on the following hosts: \n%s\nOK? " \
                       % "\n".join(hostnames)):
        abort('OK, aborting.')
    # env.roles used by Fabric internally
    env.roles = []
    env.vhost = validgrp
    env.hosts = hosts
elif len(env.roles) > 1:
    # simplifies host detection for now…
    abort('Sorry, I currently only operate on one role at a time')
elif env.roles:
    role = env.roles[0]
    print "Retrieving list of hosts for role %s" % role
    if hasattr(env.roledefs[role], '__call__'):
        # if the role definition value is callable, call it to get the
        # list of hosts.
        sys.stdout.flush()
        rawhosts = env.roledefs[role]()
        hosts = [host['address'] for host in rawhosts]
        hostnames = [host['name'] for host in rawhosts]
        env.roles = []
        env.vhost = role
        env.hosts = hosts
    else:
        hosts = env.roledefs[role]
        env.vhost = role
        env.hosts.extend(hosts)
    print "OK"
elif env.hosts:
    # hosts specified on the commandline…
    # makes things saner if we only allow hosts already declared in
    # our vhosts, since we need a vhostpath.  And only hosts from a
    # single Role can be specified.
    print "Checking sanity of manual host selection",
    sys.stdout.flush()
    # make sure all hosts specified belong to a Role, and only one
    # Role.  Since to do this we need to resolve all role
    # hostnames, it might take a little while…
    hostlist = {}
    for vhost in env.vhosts.keys():
        hostlist[vhost] = []
        if hasattr(env.vhosts[vhost]['hosts'], '__call__'):
            hostlist[vhost].extend(env.vhosts[vhost]['hosts']())
        else:
            hostlist[vhost].append({
                    'address': env.vhosts[vhost]['hosts'][0],
                    'name': env.vhosts[vhost]['hosts'][0]
                    })
    # now check supplied hosts against list of all hosts from all roles
    role = None
    ##
    ## env.hosts might contain short names, like 'K3-App-1', so
    ## resolve those to their IP addresses; rewriting env.hosts
    ## accordingly.
    ##
    for i, host in enumerate(env.hosts): # hosts from commandline
        for vhost in hostlist.keys():
            for host_dict in hostlist[vhost]:
                if host in host_dict['address']:
                    # the role this host belongs to
                    if role is None:
                        role = vhost
                    elif role != vhost:
                        abort("Sorry, only hosts for a single role can be provided")
                    # we've got a role for the provided host
                    continue
                elif host in host_dict['name']:
                    env.hosts[i] = host_dict['address']
                    # the role this host belongs to
                    if role is None:
                        role = vhost
                    elif role != vhost:
                        abort("Sorry, only hosts for a single role can be provided")
                    # we've got a role for the provided host
                    continue
    if role is None:
        abort("Sorry, only hosts from a declared role can be provided")
    else:
        env.vhost = role
    print "OK"

# TODO would be nice to still be able to force execution as a
# specified user.
#if env.user != 'fabric':
#    if not confirm("Really run commands as %s?" % env.user):
#        abort("OK, aborting.")
#env.user = 'fabric'
