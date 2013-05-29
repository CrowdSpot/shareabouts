# -*- coding: utf-8 -*-
import os
import subprocess

from fabric.api import abort, env, hide, local, prefix, put, task
from fabric.context_managers import cd, lcd
from fabric.decorators import runs_once
from fabric.operations import run, sudo


# naturally, this means that deploys should be initiated from within
# the top-level of the repository containing the code to be deployed.
PROJECT_PATH = os.getcwd()


@task
def deploy():
    """Deploy code to hosts and restart services.
    """

    #check_clean()
    chownvhost()
    #stopservices()
    pull()
    #    requirements()
    chownvhost()
    #    syncdb()
    #    migrate()
    #startservices()


@task
def kickpuppy():
    """Runs a 'service puppet restart'
    """

    sudo('/usr/sbin/service puppet restart')


@task
def tagdeploy(tag):
    """A version of 'quickdeploy' to deploy a tag.
    """

    stopservices()
    checkouttag(tag)
    requirements()
    chownvhost()
    syncdb()
    migrate()
    startservices()


@task
def chownvhost():
    """Ensures various directories are owned by www-data:staff.
    """

    with hide('running'):
        sudo('/bin/chown -R www-data:staff %s/%s' % (env.vhosts[env.vhost]['vhostpath'],
            env.vhosts[env.vhost]['worktree']))
        sudo('/bin/chown -R www-data:staff %s/%s' % (env.vhosts[env.vhost]['vhostpath'],
            env.vhosts[env.vhost]['reponame']))
        sudo('/bin/chown -R www-data:staff %s/static' % env.vhosts[env.vhost]['vhostpath'])
        sudo('/bin/chmod -R ug+rw %s/static' % env.vhosts[env.vhost]['vhostpath'])


def manage(command):
    """All purpose manage.py commands
    """

    with hide('running'):
        print "Running %s on %s " % (command, env.host)
        with prefix('source %s/env/bin/activate' % env.vhosts[env.vhost]['vhostpath']):
            with cd("%s/%s" % (env.vhosts[env.vhost]['vhostpath'],
                                  env.vhosts[env.vhost]['worktree'])):
                run("%s %s --verbosity=2 --settings=%s" % (
                        env.vhosts[env.vhost]['manage'],
                        command,
                        env.vhosts[env.vhost]['settings']))


@task
@runs_once
def check_clean():
    """Check for clean working tree.

    Uses “non-porcelain” Git commands (i.e. it uses “plumbing”
    commands), which are supposed to be much more stable than user
    interface commands.
    """

    print "Checking for a clean tree "
    # update the index first
    with hide('running'):
        with lcd(PROJECT_PATH):
            local('git update-index -q --ignore-submodules --refresh')
        # 1. check for unstaged changes in the working tree
        rtncode = subprocess.call(['git', 'diff-files', '--quiet',
                                   '--ignore-submodules', '--'],
                                  cwd=PROJECT_PATH)
        if rtncode:
            # Python < 2.7 doesn't have subprocess.check_call :(
            process = subprocess.Popen(['git', 'diff-files',
                                        '--name-status', '-r',
                                        '--ignore-submodules', '--'],
                                       stdout=subprocess.PIPE,
                                       cwd=PROJECT_PATH)
            output, err = process.communicate()
            print '\n\n%s' % output.strip()
            abort('Resolve your unstaged changes before deploying!')
        # 2. check for uncommitted changes in the index
        rtncode = subprocess.call(['git', 'diff-index', '--cached',
                                   '--quiet', 'HEAD',
                                   '--ignore-submodules', '--'],
                                  cwd=PROJECT_PATH)
        if rtncode:
            # Python < 2.7 doesn't have subprocess.check_call :(
            process = subprocess.Popen(['git', 'diff-index', '--cached',
                                        '--name-status', '-r',
                                        '--ignore-submodules',
                                        'HEAD', '--'],
                                       stdout=subprocess.PIPE,
                                       cwd=PROJECT_PATH)
            output, err = process.communicate()
            print '\n\n%s' % output.strip()
            abort('Resolve your uncommitted changes before deploying!')
        # 3. check for untracked files in the working tree
        process = subprocess.Popen(['git', 'ls-files', '--others',
                                    '--exclude-standard', '--error-unmatch',
                                    '--'],
                                   stdout=subprocess.PIPE,
                                   cwd=PROJECT_PATH)
        output, err = process.communicate()
        if output:
            print '\n\n%s' % output.strip()
            abort('Resolve your untracked files before deploying!')
        # 4. check the refspec and commit to ensure it's on the origin
        # server (so can be pulled onto the deployment target)
        refspec = os.getenv('GIT_REFSPEC', False)
        revision = os.getenv('GIT_COMMIT', False)
        if not refspec or not revision:
            with lcd(PROJECT_PATH):
                # determine refspec and revision using git plumbing.
                refspec = local("git symbolic-ref HEAD",
                                capture=True).strip()
                revision = local("git rev-parse --verify HEAD",
                                 capture=True).strip()
        print 'Fetching origin refs'
        local('git fetch origin')
        process = subprocess.Popen(['git', 'branch', '-r', '--contains', revision],
                                   stdout=subprocess.PIPE,
                                   cwd=PROJECT_PATH)
        output, err = process.communicate()
        if not output:
            abort("The revision you're trying to deploy doesn't exist in the origin.  You have to push.")
    print "OK"


@task
@runs_once
def migrate():
    """Run migrations.
    """

    with hide('running'):
        print "Running migrate on %s " % env.host
        with prefix('source %s/env/bin/activate' % env.vhosts[env.vhost]['vhostpath']):
            with cd("%s/%s" % (env.vhosts[env.vhost]['vhostpath'],
                    env.vhosts[env.vhost]['worktree'])):
                run("%s migrate --noinput --settings=%s" % (
                        env.vhosts[env.vhost]['manage'],
                        env.vhosts[env.vhost]['settings']))
    print "OK"


@task
@runs_once
def syncdb():
    """Run syncdb.
    """

    with hide('running'):
        print "Running syncdb on %s " % env.host
        with prefix('source %s/env/bin/activate' % env.vhosts[env.vhost]['vhostpath']):
            with cd("%s/%s" % (env.vhosts[env.vhost]['vhostpath'],
                    env.vhosts[env.vhost]['worktree'])):
                run("%s syncdb --noinput --migrate --settings=%s" % (
                        env.vhosts[env.vhost]['manage'],
                        env.vhosts[env.vhost]['settings'])),
    print "OK"


@task
def checkouttag(tag):
    """Checks out a tag from the repository into the worktree.
    """

    with cd('%s/%s' % (env.vhosts[env.vhost]['vhostpath'],
                       env.vhosts[env.vhost]['reponame'])):
        run('git fetch --tags')
        # delete the old worktree before checking out fresh
        sudo('/bin/chmod -R g+w %s/%s/*' % (env.vhosts[env.vhost]['vhostpath'],
                                            env.vhosts[env.vhost]['worktree']))
        #        run('rm -rf %s/%s/*' % (env.vhosts[env.vhost]['vhostpath'],
        #                                env.vhosts[env.vhost]['worktree']))
        sudo('/bin/chmod -R g+w .')
        sudo('/usr/bin/git checkout -f %s' % tag)
        sudo('/bin/chmod -R g+w %s/%s/*' % (env.vhosts[env.vhost]['vhostpath'],
                                            env.vhosts[env.vhost]['worktree']))
    print "OK"


@task
def pull():
    """Fetch and checkout the revision from the repo.
    """

    with hide():
        refspec = os.getenv('GIT_REFSPEC', False)
        revision = os.getenv('GIT_COMMIT', False)
        if not refspec or not revision:
            with lcd(PROJECT_PATH):
                # determine refspec and revision using git plumbing.
                refspec = local("git symbolic-ref HEAD",
                                capture=True).strip()
                revision = local("git rev-parse --verify HEAD",
                                 capture=True).strip()
        with cd('%s/%s' % (env.vhosts[env.vhost]['vhostpath'],
                           env.vhosts[env.vhost]['reponame'])):
            run('git fetch origin %s' % refspec)
            # delete the old worktree before checking out fresh
            sudo('/bin/chmod -R g+w %s/%s/*' % (env.vhosts[env.vhost]['vhostpath'],
                                                env.vhosts[env.vhost]['worktree']))
            #            run('rm -rf %s/%s/*' % (env.vhosts[env.vhost]['vhostpath'],
            #                                  env.vhosts[env.vhost]['worktree']))
            sudo('/bin/chmod -R g+w .')
            sudo('/usr/bin/git checkout -f %s' % revision)
            sudo('/bin/chown -R www-data:staff %s/%s' % (
                env.vhosts[env.vhost]['vhostpath'],
                env.vhosts[env.vhost]['reponame']))
            sudo('/bin/chown -R www-data:staff %s/%s' % (
                env.vhosts[env.vhost]['vhostpath'],
                env.vhosts[env.vhost]['worktree']))
    print "OK"


@task
def requirements():
    """Install or upgrade requirements, using pip.
    """

    with hide():
        with prefix('source %s/env/bin/activate' % env.vhosts[env.vhost]['vhostpath']):
            with cd("%s/env" % env.vhosts[env.vhost]['vhostpath']):
                # clear out the build directory; issues with rollyourown
                sudo("/bin/rm -rf build")
            with cd("%s/%s" % (env.vhosts[env.vhost]['vhostpath'],
                    env.vhosts[env.vhost]['worktree'])):
                run("pip install -r %s" % env.vhosts[env.vhost]['requirements'])
    print "OK"


@task
def restart():
    """Restart workers.

    By default, will only restart supervisor's "sync" workers, but if
    the Roles definition says to do so we'll also restart gunicorn
    async and celery workers.

    If generatemedia is True for the role, then this command will also
    generate media before restarting workers.
    """

    with hide('running'):
        with cd(env.vhosts[env.vhost]['vhostpath']):
            print "Restarting %s " % env.host
            if env.vhosts[env.vhost]['sync']:
                run("supervisorctl restart %s_gunicorn_sync" % env.vhost)
            if env.vhosts[env.vhost]['async']:
                run("supervisorctl restart %s_gunicorn_async" % env.vhost)
            if env.vhosts[env.vhost]['celery']:
                run("supervisorctl restart %s_celery" % env.vhost)
    print "OK"


@task
def stopservices():
    """Stop services.
    """

    with hide('running'):
        with cd(env.vhosts[env.vhost]['vhostpath']):
            print "Stopping %s " % env.host
            if env.vhosts[env.vhost]['sync']:
                run("supervisorctl stop %s_gunicorn_sync" % env.vhost)
            if env.vhosts[env.vhost]['async']:
                run("supervisorctl stop %s_gunicorn_async" % env.vhost)
            if env.vhosts[env.vhost]['celery']:
                run("supervisorctl stop %s_celery" % env.vhost)
    print "OK"


@task
def startservices():
    """Start services.
    """

    with hide('running'):
        with cd(env.vhosts[env.vhost]['vhostpath']):
            print "Starting %s " % env.host
            if env.vhosts[env.vhost]['sync']:
                run("supervisorctl start %s_gunicorn_sync" % env.vhost)
            if env.vhosts[env.vhost]['async']:
                run("supervisorctl start %s_gunicorn_async" % env.vhost)
            if env.vhosts[env.vhost]['celery']:
                run("supervisorctl start %s_celery" % env.vhost)
    print "OK"


@task
def listroles():
    """Lists the roles defined in HOST_ROLES module.
    """

    print 'I know about the following roles: %s' % \
        ', '.join(env.vhosts.keys())


@task
def maintenance():
    """Puts site into maintenance mode.

    Does not prevent ELB health check from working, so will not
    trigger removal of app server from pool.
    """

    if os.path.exists(os.path.join(PROJECT_PATH, 'maintenance.html')):
        put(os.path.join(PROJECT_PATH, 'maintenance.html'),
            '%s/static/maintenance.html' % env.vhosts[env.vhost]['vhostpath'])


@task
def maintenanceoff():
    """Brings site out of maintenance mode.
    """

    maint_file_path = "%s/static/maintenance.html" % \
        env.vhosts[env.vhost]['vhostpath']
    run("test -f %s && rm -f %s || true" % (maint_file_path, maint_file_path))
