#!/usr/bin/env node
const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');
const readDirSync = require('fs-readdir-recursive');
const lockfile = require('@pnpm/lockfile-file');
const glob = require('glob');
const { getParams } = require('./params');
const YAML = require('yaml');
async function start() {
  const {
    rootDir,
    rootPacakgeJson,
    outputFolder,
    workspaceData,
    prodWorkspaces,
    relatedWorkspaces,
    projectWorkspaces,
    pnpmLockDisable,
    srcLessDisable,
    srcLessSubDev,
    srcLessGlob,
    srcLessProdDisable,
    srcLessProdGlob,
    jsonFileDisable,
    jsonFileProdDisable,
    srcFilesEnable,
    srcFilesIncludeGlob,
    srcFilesExcludeGlob,
    workspacesExcludeGlob,
    includeRootDeps,
    isolateFolder,
    workspacesFolder,
    srcLessFolder,
    srcLessFolderProd,
  } = await getParams();

  const ignorePattterns = ['.', 'package.json', 'node_modules', outputFolder];

  function createDestinationFolders() {
    if (fs.existsSync(isolateFolder)) fs.rmdirSync(isolateFolder, { recursive: true });
    fs.mkdirSync(workspacesFolder, { recursive: true });

    if (srcFilesExcludeGlob) {
      const files = glob.sync(srcFilesExcludeGlob, { cwd: workspaceData.location, absolute: true, ignore: ignorePattterns });

      const filesToCopy = readDirSync(
        workspaceData.location,
        (name, i, dir) => !ignorePattterns.includes(name) && !files.includes(`${dir}/${name}`),
      );

      filesToCopy.forEach(file =>
        fse.copySync(path.join(workspaceData.location, file), path.join(isolateFolder, file), { preserveTimestamps: true }),
      );
    } else if (srcFilesIncludeGlob) {
      const files = glob.sync(srcFilesIncludeGlob, { cwd: workspaceData.location, absolute: true, ignore: ignorePattterns });

      files.forEach(file =>
        fse.copySync(file, path.join(isolateFolder, path.relative(workspaceData.location, file)), { preserveTimestamps: true }),
      );
    } else if (srcFilesEnable) {
      const filesToCopy = readDirSync(workspaceData.location, name => !ignorePattterns.includes(name));
      filesToCopy.forEach(file =>
        fse.copySync(path.join(workspaceData.location, file), path.join(isolateFolder, file), { preserveTimestamps: true }),
      );
    }
  }

  function resolveWorkspacesNewLocation() {
    relatedWorkspaces.forEach(name => {
      const subWorkspace = projectWorkspaces[name];
      const relativePath = path.relative(rootDir, subWorkspace.location);
      subWorkspace.newLocation = path.join(workspacesFolder, relativePath);

      subWorkspace.pkgJsonLocation = path.join(subWorkspace.newLocation, 'package.json');
      fs.mkdirSync(subWorkspace.newLocation, { recursive: true });

      if (!srcLessSubDev) subWorkspace.pkgJson.devDependencies = {};
      fs.writeFileSync(subWorkspace.pkgJsonLocation, JSON.stringify(subWorkspace.pkgJson, null, 2));

      const files = workspacesExcludeGlob
        ? glob.sync(workspacesExcludeGlob, { cwd: subWorkspace.location, absolute: true, ignore: ignorePattterns })
        : [];

      const filesToCopy = readDirSync(
        subWorkspace.location,
        (name, i, dir) => !ignorePattterns.includes(name) && !files.includes(`${dir}/${name}`),
      );

      filesToCopy.forEach(file =>
        fse.copySync(path.join(subWorkspace.location, file), path.join(subWorkspace.newLocation, file), {
          preserveTimestamps: true,
        }),
      );
    });
  }

  function copySrcLessToNewLocation() {
    if (!srcLessDisable) {
      fs.mkdirSync(srcLessFolder, { recursive: true });
      relatedWorkspaces.forEach(name => {
        const subWorkspace = projectWorkspaces[name];
        const relativePath = path.relative(rootDir, subWorkspace.location);
        const subWorkspaceSrcLessFolder = path.join(srcLessFolder, relativePath);
        fs.mkdirSync(subWorkspaceSrcLessFolder, { recursive: true });

        fs.writeFileSync(path.join(subWorkspaceSrcLessFolder, 'package.json'), JSON.stringify(subWorkspace.pkgJson, null, 2), {
          flag: 'wx',
        });
        if (srcLessGlob) {
          const files = glob.sync(srcLessGlob, { cwd: subWorkspace.location, absolute: true, ignore: ignorePattterns });

          files.forEach(file =>
            fse.copySync(file, path.join(subWorkspaceSrcLessFolder, path.relative(subWorkspace.location, file)), {
              preserveTimestamps: true,
            }),
          );
        }
      });
    }
  }

  function copySrcLessProdToNewLocation() {
    if (!srcLessProdDisable) {
      fs.mkdirSync(srcLessFolderProd, { recursive: true });
      prodWorkspaces.forEach(name => {
        const subWorkspace = projectWorkspaces[name];
        const relativePath = path.relative(rootDir, subWorkspace.location);
        const subWorkspaceSrcLessProdFolder = path.join(srcLessFolderProd, relativePath);
        fs.mkdirSync(subWorkspaceSrcLessProdFolder, { recursive: true });

        fs.writeFileSync(path.join(subWorkspaceSrcLessProdFolder, 'package.json'), JSON.stringify(subWorkspace.pkgJson, null, 2), {
          flag: 'wx',
        });

        if (srcLessProdGlob) {
          const files = glob.sync(srcLessProdGlob, { cwd: subWorkspace.location, absolute: true, ignore: ignorePattterns });

          files.forEach(file =>
            fse.copySync(file, path.join(subWorkspaceSrcLessProdFolder, path.relative(subWorkspace.location, file)), {
              preserveTimestamps: true,
            }),
          );
        }
      });
    }
  }

  function createMainJsonFile() {
    let currentDevDependencies = {};

    if (workspaceData.pkgJson.devDependencies) {
      currentDevDependencies = JSON.parse(JSON.stringify(workspaceData.pkgJson.devDependencies));

      if (includeRootDeps) {
        currentDevDependencies = {
          ...rootPacakgeJson.devDependencies,
          ...currentDevDependencies,
        };
      }
    }

    if (includeRootDeps) {
      workspaceData.pkgJson.dependencies = {
        ...rootPacakgeJson.dependencies,
        ...workspaceData.pkgJson.dependencies,
      };
    }

    if (!jsonFileProdDisable) {
      workspaceData.pkgJson.devDependencies = {};
      fs.writeFileSync(path.join(isolateFolder, 'package-prod.json'), JSON.stringify(workspaceData.pkgJson, null, 2));
    }

    workspaceData.pkgJson.devDependencies = currentDevDependencies;
    if (!jsonFileDisable) {
      fs.writeFileSync(path.join(isolateFolder, 'package.json'), JSON.stringify(workspaceData.pkgJson, null, 2));
    }
  }

  function createWorkspaceYaml() {
    const file = fs.readFileSync(path.join(rootDir, 'pnpm-workspace.yaml'), 'utf8');
    const worksapceymalFile = YAML.parse(file);

    worksapceymalFile.packages = relatedWorkspaces.map(name => projectWorkspaces[name].resolvePath);

    fs.writeFileSync(path.join(isolateFolder, 'pnpm-workspace.yaml'), YAML.stringify(worksapceymalFile));
  }

  async function createPnpmLock() {
    if (pnpmLockDisable) return;

    if (!fs.existsSync(path.join(rootDir, 'pnpm-lock.yaml'))) {
      console.warn('no pnpm-lock.yaml file on project root');
      return;
    }

    const importersNames = relatedWorkspaces.map(name => projectWorkspaces[name].reletivePath);

    let recuireDeps = await lockfile.readWantedLockfile(rootDir, 'utf8');

    recuireDeps.importers['.'] = JSON.parse(JSON.stringify(recuireDeps.importers[workspaceData.reletivePath]));
    delete recuireDeps.importers[workspaceData.name];

    Object.keys(recuireDeps.importers).forEach(key => {
      Object.keys(recuireDeps.importers[key].dependencies).forEach(depName => {
        if (relatedWorkspaces.includes(depName)) {
          recuireDeps.importers[key].dependencies[depName] = `link:./${projectWorkspaces[depName].resolvePath}`;
        }
      });
    });

    Object.keys(recuireDeps.importers).forEach(key => {
      if (!importersNames.includes(key) && key !== '.') delete recuireDeps.importers[key];
    });

    const getDepsList = dependencies => {
      const acc = [];
      Object.entries(dependencies).forEach(([key, value]) => {
        const depKey = `/${key}/${value}`;
        if (!acc.includes(depKey) && !relatedWorkspaces.includes(key)) acc.push(depKey);
      });
      return acc;
    };

    const listOfDeps = Object.values(recuireDeps.importers).reduce(
      (acc, { dependencies }) => [...new Set([...acc, ...getDepsList(dependencies)])],
      [],
    );

    let allDeps = [];
    const recursicveGet = list => {
      list.forEach(name => {
        if (recuireDeps.packages[name].dependencies) {
          const currentList = getDepsList(recuireDeps.packages[name].dependencies);

          if (currentList) {
            allDeps = [...new Set([...allDeps, ...currentList])];
            recursicveGet(currentList);
          }
        }
      });
    };

    recursicveGet(listOfDeps);
    Object.keys(recuireDeps.packages).forEach(key => {
      if (!allDeps.includes(key)) delete recuireDeps.packages[key];
    });

    await lockfile.writeWantedLockfile(isolateFolder, recuireDeps);
  }

  createDestinationFolders();
  resolveWorkspacesNewLocation();
  copySrcLessToNewLocation();
  copySrcLessProdToNewLocation();
  createMainJsonFile();
  createWorkspaceYaml();
  await createPnpmLock();
}

start();
